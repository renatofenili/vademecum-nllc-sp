// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ActNode {
  id: string;
  tipo: string;
  numero: string;
  ementa: string;
  orgao_emissor: string | null;
  data_publicacao: string;
  status: string | null;
}

interface ActEdge {
  from_act: string;
  to_act: string;
  relation_type: "implements" | "regulates" | "refers_to" | "amends" | "revokes";
  evidences: {
    from_anchor: string;
    to_anchor: string;
    excerpt: string;
  }[];
}

interface GraphResponse {
  root: string;
  nodes: ActNode[];
  edges: ActEdge[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let root = "lei14133";
    let depth = 2;

    // Support both GET query params and POST body
    if (req.method === "GET") {
      const url = new URL(req.url);
      root = url.searchParams.get("root") || "lei14133";
      depth = parseInt(url.searchParams.get("depth") || "2", 10);
    } else {
      try {
        const body = await req.json();
        root = body.root || "lei14133";
        depth = body.depth || 2;
      } catch {
        // Use defaults if body parsing fails
      }
    }

    console.log(`Building acts graph with root: ${root}, depth: ${depth}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all normas from database
    const { data: normas, error: fetchError } = await supabase
      .from("normas")
      .select("id, tipo, numero, ementa, orgao_emissor, data_publicacao, status, remissoes_extraidas")
      .order("data_publicacao", { ascending: false });

    if (fetchError) {
      console.error("Error fetching normas:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build nodes from database normas
    const nodes: ActNode[] = (normas || []).map((n: any) => ({
      id: n.id,
      tipo: n.tipo,
      numero: n.numero,
      ementa: n.ementa,
      orgao_emissor: n.orgao_emissor,
      data_publicacao: n.data_publicacao,
      status: n.status,
    }));

    // Build edges from remissoes_extraidas
    // For now, we infer inter-act relations from extracted references
    const edges: ActEdge[] = [];
    const normaMap = new Map<string, any>();
    
    for (const n of (normas || [])) {
      normaMap.set(n.id, n);
    }

    for (const norma of (normas || [])) {
      if (!norma.remissoes_extraidas) continue;

      let refs: any[];
      try {
        refs = typeof norma.remissoes_extraidas === "string" 
          ? JSON.parse(norma.remissoes_extraidas) 
          : norma.remissoes_extraidas;
      } catch {
        continue;
      }

      // Group references by target document
      const targetDocs = new Map<string, { from_anchor: string; to_anchor: string; excerpt: string }[]>();

      for (const refGroup of refs) {
        if (!refGroup.references) continue;
        
        for (const ref of refGroup.references) {
          const toDocId = ref.to_document;
          if (toDocId && toDocId !== norma.id && normaMap.has(toDocId)) {
            if (!targetDocs.has(toDocId)) {
              targetDocs.set(toDocId, []);
            }
            targetDocs.get(toDocId)!.push({
              from_anchor: refGroup.from_anchor || "",
              to_anchor: ref.to_anchor || "",
              excerpt: ref.raw_reference || "",
            });
          }
        }
      }

      // Create edges for each target document
      for (const [toDocId, evidences] of targetDocs) {
        // Infer relation type based on norm types
        const fromNorma = norma;
        const toNorma = normaMap.get(toDocId);
        
        let relationType: ActEdge["relation_type"] = "refers_to";
        
        if (toNorma) {
          // Simple heuristics for relation type
          if (fromNorma.tipo === "decreto" && toNorma.tipo === "lei") {
            relationType = "regulates";
          } else if (fromNorma.tipo === "portaria" && (toNorma.tipo === "decreto" || toNorma.tipo === "lei")) {
            relationType = "implements";
          } else if (fromNorma.tipo === "resolucao" && toNorma.tipo === "lei") {
            relationType = "regulates";
          }
        }

        edges.push({
          from_act: norma.id,
          to_act: toDocId,
          relation_type: relationType,
          evidences: evidences.slice(0, 5), // Limit evidences
        });
      }
    }

    // Add virtual root nodes for CF/88 and Lei 14.133
    const virtualNodes: ActNode[] = [];
    
    if (root === "cf88") {
      virtualNodes.push({
        id: "cf88",
        tipo: "constituicao",
        numero: "CF/1988",
        ementa: "Constituição da República Federativa do Brasil de 1988",
        orgao_emissor: "Assembleia Nacional Constituinte",
        data_publicacao: "1988-10-05",
        status: "vigente",
      });
    } else if (root === "lei14133") {
      virtualNodes.push({
        id: "lei14133",
        tipo: "lei",
        numero: "14.133/2021",
        ementa: "Lei de Licitações e Contratos Administrativos",
        orgao_emissor: "Governo Federal",
        data_publicacao: "2021-04-01",
        status: "vigente",
      });
    }

    const result: GraphResponse = {
      root,
      nodes: [...virtualNodes, ...nodes],
      edges,
    };

    console.log(`Graph built: ${result.nodes.length} nodes, ${result.edges.length} edges`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in graph-acts:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
