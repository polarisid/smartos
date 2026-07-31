import { GoogleGenAI } from '@google/genai';
import { RouteStop } from '@/lib/data';

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

/**
 * Uses Gemini AI model to analyze the full geographic context, cities, regional highway network,
 * and Tat/LP priorities to produce the most logical driving sequence for a route.
 */
export async function optimizeRouteWithGeminiAI(
  stops: RouteStop[],
  baseAddress: string = "Aracaju - SE"
): Promise<{ stops: RouteStop[]; summary: string } | null> {
  if (!stops || stops.length <= 1) {
    return { stops, summary: "Poucas paradas para otimização." };
  }

  if (!apiKey) {
    console.warn("Gemini API key not configured, returning null to fallback.");
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Prepare clean list of stops for Gemini prompt
    const stopsList = stops.map((s, idx) => ({
      id: idx,
      serviceOrder: s.serviceOrder,
      city: s.city || '',
      state: s.state || 'SE',
      neighborhood: s.neighborhood || '',
      zipCode: s.zipCode || '',
      warrantyType: s.warrantyType || '',
      tat: s.tat || '',
    }));

    const prompt = `Você é um especialista em logística e roteamento rodoviário inteligente de frotas técnicas no Nordeste do Brasil (Sergipe, Alagoas, Bahia, Pernambuco, Paraíba).

PONTO DE PARTIDA E RETORNO (BASE/LOJA): "${baseAddress}".

LISTA DE ATENDIMENTOS/PARADAS PARA OTIMIZAR:
${JSON.stringify(stopsList, null, 2)}

INSTRUÇÕES DE ROTEAMENTO LOGÍSTICO EXIGIDAS:
1. Analise o mapa rodoviário real das rodovias (ex: BR-101, SE-270, SE-170, SE-230) ligando a Base aos municípios e bairros listados.
2. Agrupe cidades e bairros contíguos de forma a criar um CIRCUITO CONTÍNUO E FLUIDO sem idas e vindas nem ziguezague rodoviário.
3. Se houver cidades distantes no interior (ex: Propriá, Neópolis, Canindé, Tobias Barreto, Lagarto), faça um circuito de ida por uma rodovia e volta por outra rodovia conectada, atendendo as cidades vizinhas na sequência geográfica exata.
4. Respeite as prioridades de garantia LP (Linha Principal/Prioritária).

FORMATO DE RESPOSTA EXIGIDO (JSON estrito):
Responda APENAS com um objeto JSON válido (sem markdown extra nem explicações fora do JSON):
{
  "orderedIds": [3, 0, 1, 4, ...],
  "summary": "Breve explicação clara do circuito logístico sugerido pela IA (max 2 frases)."
}
Note: "orderedIds" deve conter TODOS os IDs de 0 a ${stops.length - 1} na nova ordem sugerida de atendimento.`;

    let responseText = '';

    // Model fallback chain: Gemini 2.5 Pro (Highest reasoning/spatial accuracy) -> Gemini 2.5 Flash -> Gemini 1.5 Pro
    const modelsToTry = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro'];

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });

        if (response && response.text) {
          responseText = response.text;
          break;
        }
      } catch (err) {
        console.warn(`Model ${modelName} failed or unavailable, trying next model in chain...`, err);
      }
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.orderedIds && Array.isArray(parsed.orderedIds) && parsed.orderedIds.length === stops.length) {
        const reorderedStops = parsed.orderedIds
          .map((id: number) => stops[id])
          .filter(Boolean);

        if (reorderedStops.length === stops.length) {
          return {
            stops: reorderedStops,
            summary: parsed.summary || "Circuito logístico contínuo otimizado pela inteligência artificial Gemini."
          };
        }
      }
    }
  } catch (err) {
    console.error("Error optimizing route with Gemini AI:", err);
  }

  return null;
}
