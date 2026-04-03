import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um especialista em licitações públicas brasileiras. Analise o edital fornecido e extraia as informações em formato JSON com a seguinte estrutura:

{
  "objeto": "descrição completa do objeto da licitação",
  "valor_estimado": "valor estimado ou máximo, se mencionado (ex: R$ 1.500.000,00). Se não houver, retorne 'Não informado no edital'",
  "criterio_julgamento": "menor preço, maior desconto, técnica e preço, etc.",
  "data_sessao": "data e horário da sessão pública, se mencionados",
  "condicoes_habilitacao": "resumo das principais condições de habilitação exigidas (jurídica, técnica, econômico-financeira, regularidade fiscal)",
  "sistema_licitacao": "onde licitar - ex: BEC, Compras.gov.br, BLL, Licitanet, etc.",
  "modalidade": "pregão eletrônico, concorrência, etc.",
  "numero_edital": "número do edital/processo",
  "orgao": "órgão ou entidade licitante",
  "resumo_simples": "explicação do edital em linguagem simples, acessível a qualquer pessoa, com 3-5 parágrafos. Explique o que está sendo comprado/contratado, quem pode participar, como participar, e os pontos mais importantes que o licitante deve observar. Use tom didático e acolhedor."
}

IMPORTANTE:
- Retorne APENAS o JSON, sem markdown, sem blocos de código.
- Se alguma informação não estiver disponível no texto, indique "Não identificado no edital".
- Seja preciso e fiel ao conteúdo do edital.
- O resumo_simples deve ser realmente em linguagem simples, evitando jargão jurídico.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "Nenhum arquivo enviado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (file.type !== "application/pdf") {
      return new Response(
        JSON.stringify({ error: "O arquivo deve ser um PDF" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract text from PDF using the existing extract-pdf-text function pattern
    // For now, we'll send the PDF as base64 to the AI model which supports document understanding
    const arrayBuffer = await file.arrayBuffer();
    const base64 = base64Encode(new Uint8Array(arrayBuffer));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Use Gemini with PDF support via base64
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Analise este edital de licitação e extraia as informações solicitadas:",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:application/pdf;base64,${base64}`,
                  },
                },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", errorText);
      throw new Error(`AI Gateway returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content returned from AI");
    }

    // Parse JSON from response - handle potential markdown wrapping
    let parsed;
    try {
      const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleanContent);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse AI analysis");
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao analisar o edital" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
