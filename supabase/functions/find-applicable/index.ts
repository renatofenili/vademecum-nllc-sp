// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Input validation schema
const inputSchema = z.object({
  evento: z.string()
    .min(10, "evento must have at least 10 characters")
    .max(10000, "evento must have at most 10000 characters"),
});

interface ApplicableDevice {
  document_id: string;
  anchor: string;
  texto_resumido: string;
}

interface FindResult {
  evento: string;
  dispositivos_aplicaveis: ApplicableDevice[];
}

interface ExtractedArticle {
  document_id: string;
  anchor: string;
  nivel: string;
  texto: string;
}

interface Reference {
  to_document: string;
  to_anchor: string;
  raw_reference: string;
  confidence: string;
}

interface ExtractedReferences {
  from_document: string;
  from_anchor: string;
  references: Reference[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing authorization token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate input
    let rawInput;
    try {
      rawInput = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = inputSchema.safeParse(rawInput);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validation.error.errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { evento } = validation.data;

    console.log(`Finding applicable provisions for event: ${evento.substring(0, 100)}...`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all normas with extracted text and references
    const { data: normas, error: fetchError } = await supabase
      .from("normas")
      .select("id, numero, tipo, texto_extraido, remissoes_extraidas")
      .not("texto_extraido", "is", null);

    if (fetchError) {
      console.error("Error fetching normas:", fetchError);
      return new Response(
        JSON.stringify({ error: `Failed to fetch normas: ${fetchError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!normas || normas.length === 0) {
      return new Response(
        JSON.stringify({ 
          evento,
          dispositivos_aplicaveis: [],
          message: "No normas with extracted text found"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${normas.length} normas with extracted text`);

    // Collect all devices and references
    const allDevices: ExtractedArticle[] = [];
    const allReferences: ExtractedReferences[] = [];

    for (const norma of normas) {
      // Parse texto_extraido
      if (norma.texto_extraido) {
        try {
          const devices: ExtractedArticle[] = JSON.parse(norma.texto_extraido);
          allDevices.push(...devices);
        } catch {
          console.warn(`Failed to parse texto_extraido for norma ${norma.id}`);
        }
      }

      // Parse remissoes_extraidas
      if (norma.remissoes_extraidas) {
        try {
          const refs: ExtractedReferences[] = JSON.parse(norma.remissoes_extraidas);
          allReferences.push(...refs);
        } catch {
          console.warn(`Failed to parse remissoes_extraidas for norma ${norma.id}`);
        }
      }
    }

    console.log(`Collected ${allDevices.length} devices and ${allReferences.length} reference sets`);

    // Prepare data for AI - limit to avoid token overflow
    const devicesForAI = allDevices.slice(0, 200).map(d => ({
      document_id: d.document_id,
      anchor: d.anchor,
      nivel: d.nivel,
      texto: d.texto.substring(0, 500)
    }));

    const refsForAI = allReferences.slice(0, 100);

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const systemPrompt = `Você é um assistente jurídico operacional.

Tarefa:
Identificar todos os dispositivos normativos que incidem sobre o evento descrito,
utilizando exclusivamente os dispositivos e remissões fornecidos.

Saída:
Retorne SOMENTE um JSON válido:
{
  "evento": "descrição resumida do evento",
  "dispositivos_aplicaveis": [
    {
      "document_id": "...",
      "anchor": "...",
      "texto_resumido": "resumo do dispositivo em até 100 caracteres"
    }
  ]
}

Regras:
- Não classifique dispositivos.
- Não infira prazos.
- Não crie normas inexistentes.
- Use apenas o conteúdo fornecido.
- Ordene por relevância decrescente.
- Limite a 10 dispositivos mais relevantes.`;

    const userContent = `Evento:
"""
${evento}
"""

Dispositivos disponíveis:
"""
${JSON.stringify(devicesForAI, null, 2)}
"""

Remissões disponíveis:
"""
${JSON.stringify(refsForAI, null, 2)}
"""`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        temperature: 0.1,
        max_tokens: 4000,
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
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    let result: FindResult;
    try {
      result = JSON.parse(content);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", parseErr);
      result = {
        evento,
        dispositivos_aplicaveis: []
      };
    }

    console.log(`Found ${result.dispositivos_aplicaveis.length} applicable provisions`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in find-applicable:", error);

    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
