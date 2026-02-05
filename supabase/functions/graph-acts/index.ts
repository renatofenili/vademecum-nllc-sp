// deno-lint-ignore-file no-explicit-any
// Graph-acts edge function - builds normative hierarchy graph
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

// Map of virtual IDs to potential database numero patterns
const virtualIdPatterns: Record<string, string[]> = {
  "lei-14133-2021": ["14.133/2021", "14133/2021", "14.133"],
  "cf88": ["CF/1988", "CF 1988"],
  "decreto-lei-2848-1940": ["2.848/1940", "2848/1940"],
};

// Normalize a numero for comparison (lowercase, remove spaces and special chars)
const normalizeNumero = (numero: string): string => {
  return numero.toLowerCase().replace(/[\s.-]/g, "").replace(/\//g, "");
};

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
    
    // Map by ID
    for (const n of (normas || [])) {
      normaMap.set(n.id, n);
    }
    
    // Also map by normalized numero for resolving virtual references
    const normaByNormalizedNumero = new Map<string, any>();
    for (const n of (normas || [])) {
      normaByNormalizedNumero.set(normalizeNumero(n.numero), n);
    }
    
    // Helper to resolve a to_document ID (could be UUID or virtual like "lei-14133-2021")
    const resolveDocId = (toDocId: string): string | null => {
      // If it's already a known UUID
      if (normaMap.has(toDocId)) return toDocId;
      
      // Check virtual patterns (e.g., "lei-14133-2021" -> look for "14.133/2021")
      for (const [virtualId, patterns] of Object.entries(virtualIdPatterns)) {
        if (toDocId === virtualId) {
          for (const pattern of patterns) {
            const normalizedPattern = normalizeNumero(pattern);
            const norma = normaByNormalizedNumero.get(normalizedPattern);
            if (norma) {
              console.log(`Resolved virtual ID "${toDocId}" to norma ${norma.id} (${norma.numero})`);
              return norma.id;
            }
          }
        }
      }
      
      // Try extracting numbers from virtual ID and match against numeros
      const numbersFromId = toDocId.replace(/[^0-9]/g, "");
      if (numbersFromId.length >= 4) {
        for (const [normalizedNum, n] of normaByNormalizedNumero) {
          if (normalizedNum.includes(numbersFromId.slice(0, 5))) {
            console.log(`Fuzzy matched "${toDocId}" to norma ${n.id} (${n.numero})`);
            return n.id;
          }
        }
      }
      
      return null;
    };

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
          const rawToDocId = ref.to_document;
          if (!rawToDocId) continue;
          
          const resolvedId = resolveDocId(rawToDocId);
          if (!resolvedId || resolvedId === norma.id) continue;
          
          if (!targetDocs.has(resolvedId)) {
            targetDocs.set(resolvedId, []);
          }
          targetDocs.get(resolvedId)!.push({
            from_anchor: refGroup.from_anchor || "",
            to_anchor: ref.to_anchor || "",
            excerpt: ref.raw_reference || "",
          });
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
          } else if (fromNorma.tipo === "instrucao_normativa" && toNorma.tipo === "lei") {
            relationType = "regulates";
          }
        }

        edges.push({
          from_act: norma.id,
          to_act: toDocId,
          relation_type: relationType,
          evidences: evidences, // Keep all evidences for article connections
        });
      }
    }

    // Add virtual root nodes for CF/88 and Lei 14.133
    const virtualNodes: ActNode[] = [];
    
    // Check if Lei 14.133 already exists in database nodes
    const lei14133Exists = nodes.some((n) => 
      normalizeNumero(n.numero).includes("141332021") || 
      n.numero.includes("14.133")
    );
    
    if (root === "cf88") {
      // Add CF/88 as root (ring 0)
      virtualNodes.push({
        id: "cf88",
        tipo: "constituicao",
        numero: "CF/1988",
        ementa: "Constituição da República Federativa do Brasil de 1988",
        orgao_emissor: "Assembleia Nacional Constituinte",
        data_publicacao: "1988-10-05",
        status: "vigente",
      });
      
      // CRITICAL: When CF/88 is root, also include Lei 14.133 as intermediate layer (ring 1)
      // This ensures Decretos (ring 2) have a Law to connect to, never directly to CF/88
      if (!lei14133Exists) {
        virtualNodes.push({
          id: "lei14133",
          tipo: "lei_federal",
          numero: "14.133/2021",
          ementa: "Lei de Licitações e Contratos Administrativos",
          orgao_emissor: "Governo Federal",
          data_publicacao: "2021-04-01",
          status: "vigente",
        });
      }
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
