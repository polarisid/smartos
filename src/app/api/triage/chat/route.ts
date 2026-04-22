import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';

const apiKey = process.env.GEMINI_API_KEY;

export async function POST(req: Request) {
  try {
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY não configurada no servidor.' }, { status: 500 });
    }

    const body = await req.json();
    const { productModel, productLine, history, userMessage } = body;

    const ai = new GoogleGenAI({ apiKey });

    // Fetch related knowledge base documents
    const kbSnapshot = await getDocs(collection(db, "knowledgeBase_rules"));
    let knowledgeBase = "BOLETINS TÉCNICOS SAMSUMG:\n";
    kbSnapshot.docs.forEach(doc => {
      const data = doc.data();
      // Only append if it's general, if the product lines match, or if the specific target model matches
      const isGeneralLine = !data.productLine || data.productLine === 'Geral';
      const matchesLine = productLine && data.productLine === productLine;
      const matchesModel = data.productFamily && productModel.toLowerCase().includes(data.productFamily.toLowerCase());
      
      if (isGeneralLine || matchesLine || matchesModel) {
          knowledgeBase += `\n[${data.title}]:\n${data.content}\n`;
      }
    });

    // Prepare system instructions
    const systemPrompt = `
      Você é um Técnico Especialista da Samsung focado em triagem remota de produtos.
      O seu objetivo é diagnosticar o defeito de um produto (Modelo: ${productModel}, Segmento: ${productLine || 'Não especificado'}) fazendo perguntas ao cliente.
      
      Regras Essenciais:
      1. Faça APENAS UMA pergunta de cada vez. Seja super claro, educado e conciso (pareça um humano no WhatsApp).
      2. Baseie suas perguntas em problemas comuns de produtos da Samsung. 
      3. Quando você tiver 80% ou mais de certeza do problema, ou após um máximo de 5-6 perguntas, conclua a triagem.
      4. REGRA CRÍTICA: NUNCA revele o diagnóstico, o defeito ou as informações técnicas da base de conhecimento para o cliente no texto de "reply". Siga orientações corporativas e apenas agradeça genéricamente dizendo que repassará as informações ao técnico.
      5. VOCÊ DEVE SEMPRE RESPONDER EM FORMATO JSON! Não escreva texto fora do JSON.
      
      Formato de saída esperado se AINDA TEM PERGUNTAS:
      {
        "reply": "O seu televisor costuma reiniciar sozinho quando as listras aparecem?",
        "diagnosisComplete": false
      }

      Formato de saída se o DIAGNÓSTICO ESTIVER PRONTO (NUNCA mencione o defeito no reply):
      {
        "reply": "Muito obrigado pelas informações! Já anotei tudo aqui no sistema e nossa equipe técnica irá dar prosseguimento ao atendimento com base no que você relatou.",
        "diagnosisComplete": true,
        "finalDiagnosis": "Falha no painel LCD/Display",
        "suggestedParts": ["Display / Painel", "Cabo Flat FFC"],
        "symptomsReported": ["Aparece listra preta", "Imagem tremendo"]
      }

      Dados de Informação Técnica Coletados previamente (Base de Conhecimento do Admin) para te ajudar:
      ${knowledgeBase || 'Sem dados técnicos disponíveis para este modelo no momento. Aja com seu conhecimento padrão.'}
    `;

    // Convert history format to Gemini format — limit to last 8 messages to save tokens
    const trimmedHistory = history.slice(-8);
    const contents = trimmedHistory.map((msg: any) => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // Add the current user message
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2, // Low temperature for consistent responses
        responseMimeType: "application/json",
      }
    });

    const responseText = response.text || "";
    let jsonMatch = null;
    try {
        jsonMatch = JSON.parse(responseText);
    } catch(e) {
        // Fallback robust json extraction if the model hallucinates markdown tags
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
            jsonMatch = JSON.parse(match[0]);
        } else {
             throw new Error("A IA não retornou um JSON válido.");
        }
    }

    // Track API Custom Quota
    try {
        const statsRef = doc(db, 'system_stats', 'gemini_api');
        const statsSnap = await getDoc(statsRef);
        const todayStr = new Date().toISOString().split('T')[0];
        
        if (statsSnap.exists()) {
            const data = statsSnap.data();
            if (data.date === todayStr) {
                await setDoc(statsRef, { dailyRequests: (data.dailyRequests || 0) + 1, date: todayStr }, { merge: true });
            } else {
                await setDoc(statsRef, { dailyRequests: 1, date: todayStr }, { merge: true });
            }
        } else {
            await setDoc(statsRef, { dailyRequests: 1, date: todayStr });
        }
    } catch (metricError) {
        console.error("Failed to update API metrics", metricError);
    }

    return NextResponse.json(jsonMatch);

  } catch (error: any) {
    console.error('API /triage/chat error:', error);
    const status = error?.status === 429 ? 429 : 500;
    const msg = status === 429 ? "A inteligência artificial atingiu o limite de consultas gratuitas. Aguarde cerca de 1 minuto e tente novamente." : (error.message || 'Erro ao comunicar com a IA.');
    return NextResponse.json({ error: msg }, { status });
  }
}
