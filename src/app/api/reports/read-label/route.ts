import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

const apiKey = process.env.GEMINI_API_KEY;

export async function POST(req: Request) {
  try {
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY não configurada no servidor.' }, { status: 500 });
    }

    const body = await req.json();
    const { imageBase64, mimeType } = body;
    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: 'Imagem não enviada.' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `
      Você é um assistente que lê etiquetas de identificação (nameplate/rating label) de produtos eletrônicos e eletrodomésticos.
      Analise a foto da etiqueta enviada e extraia o MODELO completo do produto e o NÚMERO DE SÉRIE.

      Regras:
      1. O modelo geralmente aparece rotulado como "Model", "Modelo", "MODEL NO." ou similar.
      2. O número de série geralmente aparece rotulado como "Serial No.", "S/N", "Nº de Série" ou similar.
      3. Se não conseguir identificar algum dos dois com confiança, retorne string vazia para ele — NUNCA invente um valor.
      4. Transcreva os caracteres exatamente como aparecem na etiqueta (incluindo hífens/barras).
      5. VOCÊ DEVE SEMPRE RESPONDER EM FORMATO JSON, sem texto fora do JSON.

      Formato de saída:
      { "model": "QN55Q60C", "serial": "0A1B2C3D4E5F" }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: 'Leia a etiqueta desta foto e extraia modelo e número de série.' },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0,
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || "";
    let parsed: { model?: string; serial?: string } = {};
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

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
      model: parsed.model || '',
      serial: parsed.serial || '',
    });

  } catch (error: any) {
    console.error('API /reports/read-label error:', error);
    const status = error?.status === 429 ? 429 : 500;
    const msg = status === 429 ? "A inteligência artificial atingiu o limite de consultas gratuitas. Aguarde cerca de 1 minuto e tente novamente." : (error.message || 'Erro ao ler a etiqueta.');
    return NextResponse.json({ error: msg }, { status });
  }
}
