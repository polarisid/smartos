import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { supabase } from '@/lib/supabase';

const apiKey = process.env.GEMINI_API_KEY;

export const maxDuration = 180;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    partnerName: { type: Type.STRING },
    location: { type: Type.STRING },
    monthPeriods: { type: Type.ARRAY, items: { type: Type.STRING } },
    weekPeriods: { type: Type.ARRAY, items: { type: Type.STRING } },
    metrics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          section: { type: Type.STRING },
          name: { type: Type.STRING },
          unit: { type: Type.STRING, enum: ['percent', 'currency', 'number'] },
          meta: { type: Type.NUMBER, nullable: true },
          direction: { type: Type.STRING, enum: ['up', 'down', 'none'] },
          monthly: { type: Type.ARRAY, items: { type: Type.NUMBER, nullable: true } },
          weekly: { type: Type.ARRAY, items: { type: Type.NUMBER, nullable: true } },
        },
        required: ['section', 'name', 'unit', 'direction', 'monthly', 'weekly'],
      },
    },
  },
  required: ['monthPeriods', 'weekPeriods', 'metrics'],
};

const systemPrompt = `
  Você recebe um dump de texto extraído de um PDF de relatório de performance de parceiro Samsung (planilha de
  indicadores/KPI). O texto foi extraído linha por linha (colunas separadas por tabulação), mas a ORDEM das
  colunas dentro de cada linha pode não seguir a ordem visual esperada (esquerda-para-direita) - use o contexto
  (rótulos como "MX (%)", "VD (Qty)", nomes de seção como "FTC", "LTP", "Velocidade", símbolos "↑"/"↓"/"$", e os
  cabeçalhos de período) para remontar corretamente cada indicador.

  A tabela tem colunas de período: meses no formato "AAAA.MM" e, no final, semanas no formato "AAAA.SS" (número
  da semana ISO). As linhas são agrupadas por seção (rótulo que aparece perto das linhas, ex: "Volumetria",
  "LTP", "ex-LTP", "FTC", "Velocidade", "Perfeição", "Peças", "Qualidade", "Abertura de Tickets").

  Regras de conversão de números:
  - Formato brasileiro: vírgula é separador decimal, ponto é separador de milhar (ex: "1.227" = 1227, "6,95%" = 6.95).
  - Remova os símbolos "%" e "R$" - retorne só o número.
  - "-" ou célula ausente vira null.

  Regras de extração:
  - "unit": "percent" se a linha tem valores com "%", "currency" se tem "R$", senão "number".
  - "direction": "up" se houver "↑" associado à linha, "down" se houver "↓", "none" caso contrário.
  - "meta": valor da coluna "Meta" da linha (geralmente um número isolado antes ou depois dos valores de
    período), ou null se ausente/"-".
  - "monthPeriods"/"weekPeriods": os rótulos de período encontrados no cabeçalho, na ordem.
  - Cada indicador deve ter "monthly" com o mesmo número de valores que "monthPeriods" e "weekly" com o mesmo
    número de valores que "weekPeriods", na mesma ordem dos períodos. Use null onde não houver valor correspondente.
  - NÃO pule nenhuma linha de indicador presente no texto. NÃO invente linhas que não estão no texto.
  - IMPORTANTE: todo número no JSON de saída deve ser um número JSON válido, sem vírgula, sem "%", sem "R$".
`;

interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

interface PdfExtraction {
  text: string;
  weekPeriods: string[];
  // Valores semanais já resolvidos geometricamente (por posição x na página),
  // indexados pelo texto normalizado do rótulo da linha. Ver nota abaixo.
  weeklyByLabel: Map<string, (number | null)[]>;
}

function normalizeLabel(s: string): string {
  return (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseNumberToken(raw: string): number | null {
  const s = raw.trim();
  if (s === '-' || s === '') return null;
  const cleaned = s.replace(/^R\$\s?/i, '').replace(/%$/, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const PERIOD_RE = /^(\d{4})\.(\d{2})$/;
const VALUE_RE = /^-$|^R\$\s?[\d.,]+$|^[\d.,]+%?$/;
const NON_LABEL_TOKENS = new Set(['$', '↑', '↓']);

// Extrai o texto do PDF (dump linha a linha, por posição vertical) para a IA
// estruturar semanticamente, e SEPARADAMENTE resolve os valores das "últimas
// semanas" de forma determinística por posição x na página.
//
// Por quê: as colunas de semana ficam bem à direita na página, fisicamente
// isoladas do bloco de meses por um vão grande (~200pt, contra ~40pt entre
// colunas normais) - dá pra detectar esse vão de forma confiável e cortar ali,
// não importa quantos meses aquela linha tem preenchidos. Deixar a IA inferir
// isso só do texto (sem essa geometria) foi o que causava semanas vindo nulas
// ou misturadas com meses.
async function extractPdfData(buffer: Buffer): Promise<PdfExtraction> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;

  let fullText = '';
  let weekPeriods: string[] = [];
  const weeklyByLabel = new Map<string, (number | null)[]>();

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = (content.items as any[])
      .map((it) => ({ str: it.str as string, x: it.transform[4] as number, y: it.transform[5] as number }))
      .filter((it) => it.str.trim() !== '');

    // Cabeçalho de período: meses têm "MM" <= 12, semanas (número ISO) > 12.
    const periodTokens = items.filter((it) => PERIOD_RE.test(it.str.trim()));
    if (periodTokens.length > 0) {
      const yCounts = new Map<number, number>();
      periodTokens.forEach((t) => { const k = Math.round(t.y); yCounts.set(k, (yCounts.get(k) || 0) + 1); });
      const headerY = [...yCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const headerRow = periodTokens.filter((t) => Math.abs(t.y - headerY) <= 3).sort((a, b) => a.x - b.x);
      const pageWeeks = headerRow.filter((t) => Number(t.str.trim().split('.')[1]) > 12).map((t) => t.str.trim());
      if (pageWeeks.length > weekPeriods.length) weekPeriods = pageWeeks;
    }

    items.sort((a, b) => b.y - a.y || a.x - b.x);

    const rows: PdfTextItem[][] = [];
    let currentY: number | null = null;
    let currentRow: PdfTextItem[] = [];
    for (const it of items) {
      if (currentY === null || Math.abs(it.y - currentY) > 3) {
        if (currentRow.length) rows.push(currentRow);
        currentRow = [it];
        currentY = it.y;
      } else {
        currentRow.push(it);
      }
    }
    if (currentRow.length) rows.push(currentRow);

    for (const row of rows) {
      const sortedRow = [...row].sort((a, b) => a.x - b.x);
      fullText += sortedRow.map((i) => i.str).join('\t') + '\n';

      if (weekPeriods.length === 0) continue;
      const valueTokens = sortedRow.filter((it) => VALUE_RE.test(it.str.trim()));
      if (valueTokens.length < weekPeriods.length + 1) continue;

      let maxGap = -1;
      let splitIdx = -1;
      for (let i = 1; i < valueTokens.length; i++) {
        const gap = valueTokens[i].x - valueTokens[i - 1].x;
        if (gap > maxGap) { maxGap = gap; splitIdx = i; }
      }
      if (splitIdx === -1 || maxGap < 100) continue; // sem vão claro -> sem bloco semanal nesta linha
      const weekTokens = valueTokens.slice(splitIdx);
      if (weekTokens.length !== weekPeriods.length) continue;

      const labelTokens = sortedRow.filter((it) => !VALUE_RE.test(it.str.trim()) && !NON_LABEL_TOKENS.has(it.str.trim()));
      const label = normalizeLabel(labelTokens.map((t) => t.str).join(' '));
      if (!label) continue;

      weeklyByLabel.set(label, weekTokens.map((t) => parseNumberToken(t.str)));
    }
    fullText += '\n';
  }
  return { text: fullText, weekPeriods, weeklyByLabel };
}

export async function POST(req: Request) {
  try {
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY não configurada no servidor.' }, { status: 500 });
    }

    const body = await req.json();
    const { pdfBase64 } = body as { pdfBase64?: string };
    if (!pdfBase64) {
      return NextResponse.json({ error: 'PDF não enviado.' }, { status: 400 });
    }

    const { text: pdfText, weekPeriods: detectedWeekPeriods, weeklyByLabel } = await extractPdfData(Buffer.from(pdfBase64, 'base64'));
    if (!pdfText.trim()) {
      return NextResponse.json({ error: 'Não foi possível ler texto deste PDF.' }, { status: 422 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Texto extraído do PDF:\n\n${pdfText}` },
            { text: 'Estruture todos os indicadores deste texto em JSON conforme o schema.' },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema,
        maxOutputTokens: 32768,
        thinkingConfig: { thinkingBudget: 4096 },
        httpOptions: { timeout: 170000 },
      },
    });

    const responseText = response.text || "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const monthPeriods: string[] = Array.isArray(parsed.monthPeriods) ? parsed.monthPeriods : [];
    const weekPeriods: string[] = Array.isArray(parsed.weekPeriods) ? parsed.weekPeriods : [];
    const rawMetrics: any[] = Array.isArray(parsed.metrics) ? parsed.metrics : [];

    const slugify = (s: string) => (s || '')
      .normalize('NFD').replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const zipPoints = (periods: string[], values: any[]) => periods.map((period, i) => ({
      period,
      value: typeof values?.[i] === 'number' ? values[i] : null,
    }));

    // Algumas linhas do relatório compartilham o mesmo nome dentro da mesma
    // seção (ex: duas linhas "(Qty)" sob grupos diferentes de CRRR) - só
    // sufixa a chave quando há colisão, pra manter a chave estável entre
    // uploads no caso comum (sem colisão).
    // Prioriza os períodos de semana detectados geometricamente (ground-truth
    // do PDF) sobre o eco da IA, que pode divergir.
    const effectiveWeekPeriods = detectedWeekPeriods.length > 0 ? detectedWeekPeriods : weekPeriods;

    const keyOccurrences = new Map<string, number>();
    const metrics = rawMetrics
      .filter(m => m && m.name)
      .map(m => {
        const baseKey = `${slugify(m.section || 'geral')}__${slugify(m.name)}`;
        const count = (keyOccurrences.get(baseKey) || 0) + 1;
        keyOccurrences.set(baseKey, count);

        // Sobrescreve a semana com o valor resolvido por posição na página,
        // quando encontramos uma linha correspondente - a IA erra o corte
        // mês/semana com frequência nessa tabela densa.
        const deterministicWeekly = weeklyByLabel.get(normalizeLabel(m.name));
        const weeklyValues = deterministicWeekly && deterministicWeekly.length === effectiveWeekPeriods.length
          ? deterministicWeekly
          : (m.weekly || []);

        return {
          key: count === 1 ? baseKey : `${baseKey}__${count}`,
          section: m.section || 'Geral',
          name: m.name,
          unit: ['percent', 'currency', 'number'].includes(m.unit) ? m.unit : 'number',
          meta: typeof m.meta === 'number' ? m.meta : null,
          direction: m.direction === 'up' || m.direction === 'down' ? m.direction : null,
          monthly: zipPoints(monthPeriods, m.monthly || []),
          weekly: zipPoints(effectiveWeekPeriods, weeklyValues),
        };
      });

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: statsData } = await supabase.from('system_stats').select('*').eq('id', 'gemini_api').single();
      if (statsData) {
        if (statsData.date === todayStr) {
          await supabase.from('system_stats').update({ daily_requests: (statsData.daily_requests || 0) + 1, date: todayStr }).eq('id', 'gemini_api');
        } else {
          await supabase.from('system_stats').update({ daily_requests: 1, date: todayStr }).eq('id', 'gemini_api');
        }
      } else {
        await supabase.from('system_stats').insert({ id: 'gemini_api', daily_requests: 1, date: todayStr });
      }
    } catch (metricError) {
      console.error("Failed to update API metrics", metricError);
    }

    if (metrics.length === 0) {
      return NextResponse.json({ error: 'Não foi possível extrair indicadores deste PDF.' }, { status: 422 });
    }

    return NextResponse.json({
      partnerName: parsed.partnerName || '',
      location: parsed.location || '',
      metrics,
    });

  } catch (error: any) {
    console.error('API /indicators/parse-report error:', error);
    const status = error?.status === 429 ? 429 : 500;
    const msg = status === 429 ? "A inteligência artificial atingiu o limite de consultas gratuitas. Aguarde cerca de 1 minuto e tente novamente." : (error.message || 'Erro ao processar o relatório em PDF.');
    return NextResponse.json({ error: msg }, { status });
  }
}
