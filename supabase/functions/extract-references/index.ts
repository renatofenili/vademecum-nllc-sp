// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Reference {
  to_document: string;
  to_anchor: string;
  raw_reference: string;
  confidence: "alta" | "media" | "baixa";
}

interface ExtractedReferences {
  from_document: string;
  from_anchor: string;
  references: Reference[];
}

interface ExtractedArticle {
  document_id: string;
  anchor: string;
  nivel: string;
  texto: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { norma_id } = await req.json();

    if (!norma_id) {
      return new Response(
        JSON.stringify({ error: "norma_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting reference extraction for norma: ${norma_id}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the norma with extracted text
    const { data: norma, error: fetchError } = await supabase
      .from("normas")
      .select("id, numero, tipo, texto_extraido")
      .eq("id", norma_id)
      .single();

    if (fetchError || !norma) {
      console.error("Error fetching norma:", fetchError);
      return new Response(
        JSON.stringify({ error: `Norma not found: ${fetchError?.message}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!norma.texto_extraido) {
      return new Response(
        JSON.stringify({ error: "Norma has no extracted text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse extracted text
    let textoEstruturado: ExtractedArticle[];
    try {
      textoEstruturado = JSON.parse(norma.texto_extraido);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid texto_extraido format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${textoEstruturado.length} items for references in batch`);

    // Update status to pendente
    await supabase.from("normas").update({
      remissoes_status: "pendente",
    }).eq("id", norma_id);

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Format all items for batch processing
    const itemsForAnalysis = textoEstruturado
      .filter(item => item.texto.length >= 30)
      .map(item => ({
        document_id: item.document_id,
        anchor: item.anchor,
        texto: item.texto.substring(0, 2000) // Limit text size per item
      }));

    console.log(`Filtered to ${itemsForAnalysis.length} items with sufficient text`);

    const systemPrompt = `Você é um analisador jurídico estrutural especializado em identificar remissões normativas.

Tarefa:
Analisar TODOS os itens abaixo e identificar TODAS as remissões normativas explícitas em cada um.

Definição de remissão:
Qualquer menção a:
- artigo, parágrafo, inciso ou alínea (internas ou externas)
- lei, decreto, resolução, instrução normativa, código
- expressões como "nos termos de", "conforme", "de que trata", "previsto no", "na forma do"

Saída OBRIGATÓRIA:
Retorne SOMENTE um JSON válido no formato:
[
  {
    "from_document": "document_id do item",
    "from_anchor": "anchor do item",
    "references": [
      {
        "to_document": "mesmo document_id se interno, ou identificador do documento externo (ex: lei-14133-2021)",
        "to_anchor": "art.X ou art.X§Y ou art.X.I etc",
        "raw_reference": "texto literal da remissão encontrada",
        "confidence": "alta" | "media" | "baixa"
      }
    ]
  }
]

Regras:
1. Inclua APENAS itens que possuem remissões (omita itens sem referências)
2. Para remissões INTERNAS ("deste artigo", "§1º deste artigo"), use o mesmo document_id
3. Para remissões EXTERNAS, identifique tipo-numero-ano (ex: "lei-14133-2021", "decreto-68304-2024")
4. Não explique nada. Não gere texto fora do JSON.`;

    const userContent = `Analise os seguintes ${itemsForAnalysis.length} itens e extraia todas as remissões normativas:

${JSON.stringify(itemsForAnalysis, null, 2)}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        temperature: 0.1,
        max_tokens: 32000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    let content = aiResult.choices?.[0]?.message?.content || "";

    console.log("AI response received, parsing JSON...");

    // Parse JSON response
    content = content.trim();
    if (content.startsWith("```json")) {
      content = content.slice(7);
    } else if (content.startsWith("```")) {
      content = content.slice(3);
    }
    if (content.endsWith("```")) {
      content = content.slice(0, -3);
    }
    content = content.trim();

    let allReferences: ExtractedReferences[];
    try {
      allReferences = JSON.parse(content);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", parseErr);
      console.error("Content was:", content.substring(0, 500));
      allReferences = [];
    }

    console.log(`Parsed ${allReferences.length} items with references`);

    // Count total references
    const totalRefs = allReferences.reduce((acc, item) => acc + (item.references?.length || 0), 0);

    // Update norma with extracted references
    const { error: updateError } = await supabase
      .from("normas")
      .update({
        remissoes_extraidas: JSON.stringify(allReferences),
        remissoes_extraidas_em: new Date().toISOString(),
        remissoes_status: "extraido",
      })
      .eq("id", norma_id);

    if (updateError) {
      console.error("Error updating norma:", updateError);
      return new Response(
        JSON.stringify({ error: `Failed to update norma: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("References extraction completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        items_com_referencias: allReferences.length,
        total_referencias: totalRefs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in extract-references:", error);

    // Try to update status to error
    try {
      const body = await req.clone().json();
      if (body.norma_id) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        await supabase.from("normas").update({
          remissoes_status: "erro",
          remissoes_extraidas_em: new Date().toISOString(),
        }).eq("id", body.norma_id);
      }
    } catch (_) {
      // Ignore errors in error handler
    }

    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
