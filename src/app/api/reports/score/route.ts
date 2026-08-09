import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

const apiKey = process.env.GEMINI_API_KEY;

const CATEGORY_LABELS: Record<string, string> = {
  produto_frontal: 'Produto - Frontal',
  produto_traseira: 'Produto - Traseira',
  produto_serial: 'Produto - Etiqueta Serial',
  defeito: 'Defeito Apresentado',
  pos_reparo: 'Pós-Reparo',
};

export async function POST(req: Request) {
  try {
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY não configurada no servidor.' }, { status: 500 });
    }

    const body = await req.json();
    const { photos } = body as { photos: { category: string; url: string }[] };
    if (!photos || photos.length === 0) {
      return NextResponse.json({ error: 'Nenhuma foto enviada para avaliação.' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const fetchedPhotos = await Promise.all(
      photos.map(async (p) => {
        const res = await fetch(p.url);
        const buffer = await res.arrayBuffer();
        const mimeType = res.headers.get('content-type') || 'image/jpeg';
        return { category: p.category, imageBase64: Buffer.from(buffer).toString('base64'), mimeType };
      })
    );

    const systemPrompt = `
      Você é um auditor de qualidade técnica que avalia relatórios fotográficos de assistência técnica
      (reparo de eletrônicos/eletrodomésticos). Você recebe as fotos anexadas pelo técnico ao final de um reparo,
      identificadas por categoria, e deve dar uma NOTA de 0 a 10.

      A nota deve se basear EXCLUSIVAMENTE nestes três critérios, com peso igual:
      1. Legibilidade das fotos: estão nítidas, bem enquadradas e com iluminação adequada para o que precisam mostrar?
         (a etiqueta serial em especial precisa estar legível).
      2. Evidência clara do defeito: a(s) foto(s) de "Defeito Apresentado" mostram de forma clara e inequívoca o
         problema relatado?
      3. Evidência clara do pós-reparo: a(s) foto(s) de "Pós-Reparo" mostram de forma clara e inequívoca que o
         reparo foi concluído (ex: tela funcionando normalmente, produto montado)?

      NÃO penalize a nota por categorias de foto ausentes (ex: faltar foto da traseira) — avalie apenas a
      legibilidade e a clareza de evidência das fotos que FORAM enviadas.

      Categorias recebidas nesta avaliação: ${fetchedPhotos.map(p => CATEGORY_LABELS[p.category] || p.category).join(', ')}

      Seja justo e direto. Escreva o feedback em português, em no máximo 2 frases curtas, citando o motivo da nota.

      VOCÊ DEVE SEMPRE RESPONDER EM FORMATO JSON, sem texto fora do JSON.
      Formato de saída: { "score": 8.5, "feedback": "Boas fotos do produto e defeito bem documentado, mas faltou a foto da traseira." }
    `;

    const imageParts = fetchedPhotos.map(p => ({
      inlineData: { mimeType: p.mimeType, data: p.imageBase64 },
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            ...imageParts,
            { text: 'Avalie a qualidade e completude deste relatório fotográfico e dê uma nota de 0 a 10.' },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || "";
    let parsed: { score?: number; feedback?: string } = {};
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(10, parsed.score)) : undefined;

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

    return NextResponse.json({
      score: score ?? null,
      feedback: parsed.feedback || '',
    });

  } catch (error: any) {
    console.error('API /reports/score error:', error);
    const status = error?.status === 429 ? 429 : 500;
    const msg = status === 429 ? "A inteligência artificial atingiu o limite de consultas gratuitas. Aguarde cerca de 1 minuto e tente novamente." : (error.message || 'Erro ao avaliar o relatório.');
    return NextResponse.json({ error: msg }, { status });
  }
}
