// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DispositivoNode {
  anchor: string;
  nivel: string;
  texto: string;
}

interface DispositivoEdge {
  from_anchor: string;
  to_anchor: string;
  to_document: string | null;
  raw_reference: string;
  confidence: string;
}

interface DispositivosGraphResponse {
  act_id: string;
  act_info: {
    tipo: string;
    numero: string;
    ementa: string;
  };
  nodes: DispositivoNode[];
  edges: DispositivoEdge[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let actId: string | null = null;

    // Support both GET query params and POST body
    if (req.method === "GET") {
      const url = new URL(req.url);
      actId = url.searchParams.get("act_id");
    } else {
      try {
        const body = await req.json();
        actId = body.act_id || null;
      } catch {
        // actId remains null
      }
    }

    if (!actId) {
      return new Response(
        JSON.stringify({ error: "act_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Building dispositivos graph for act: ${actId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the norma with its extracted text and references
    const { data: norma, error: fetchError } = await supabase
      .from("normas")
      .select("id, tipo, numero, ementa, texto_extraido, remissoes_extraidas")
      .eq("id", actId)
      .single();

    if (fetchError || !norma) {
      console.error("Error fetching norma:", fetchError);
      return new Response(
        JSON.stringify({ error: `Norma not found: ${fetchError?.message}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build nodes from texto_extraido
    const nodes: DispositivoNode[] = [];
    
    if (norma.texto_extraido) {
      let dispositivos: any[];
      try {
        dispositivos = typeof norma.texto_extraido === "string"
          ? JSON.parse(norma.texto_extraido)
          : norma.texto_extraido;
      } catch {
        dispositivos = [];
      }

      for (const disp of dispositivos) {
        if (disp.anchor) {
          nodes.push({
            anchor: disp.anchor,
            nivel: disp.nivel || "artigo",
            texto: disp.texto || "",
          });
        }
      }
    }

    // Build edges from remissoes_extraidas
    const edges: DispositivoEdge[] = [];
    
    if (norma.remissoes_extraidas) {
      let refs: any[];
      try {
        refs = typeof norma.remissoes_extraidas === "string"
          ? JSON.parse(norma.remissoes_extraidas)
          : norma.remissoes_extraidas;
      } catch {
        refs = [];
      }

      for (const refGroup of refs) {
        if (!refGroup.references) continue;
        
        for (const ref of refGroup.references) {
          edges.push({
            from_anchor: refGroup.from_anchor || "",
            to_anchor: ref.to_anchor || "",
            to_document: ref.to_document !== actId ? ref.to_document : null,
            raw_reference: ref.raw_reference || "",
            confidence: ref.confidence || "medium",
          });
        }
      }
    }

    const result: DispositivosGraphResponse = {
      act_id: actId,
      act_info: {
        tipo: norma.tipo,
        numero: norma.numero,
        ementa: norma.ementa,
      },
      nodes,
      edges,
    };

    console.log(`Dispositivos graph built: ${result.nodes.length} nodes, ${result.edges.length} edges`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in graph-dispositivos:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
