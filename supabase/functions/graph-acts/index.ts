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
      
      // DOMAIN RULE: Block DECRETO -> CF edges (structural rule)
      // Decrees cannot connect directly to CF/88, only textual references allowed
      if (fromNorma.tipo === "decreto" && (toDocId === "cf88" || toNorma?.tipo === "constituicao")) {
        console.log(`Blocked structural edge: Decreto ${fromNorma.numero} -> CF/88 (domain rule)`);
        continue; // Skip this edge entirely
      }
      
      let relationType: ActEdge["relation_type"] = "refers_to";
      
      if (toNorma) {
        // Simple heuristics for relation type
        if (fromNorma.tipo === "decreto" && (toNorma.tipo === "lei" || toNorma.tipo === "lei_federal" || toNorma.tipo === "lei_estadual")) {
          relationType = "regulates";
        } else if (fromNorma.tipo === "portaria" && (toNorma.tipo === "decreto" || toNorma.tipo === "lei" || toNorma.tipo === "lei_federal")) {
          relationType = "implements";
        } else if (fromNorma.tipo === "resolucao" && (toNorma.tipo === "lei" || toNorma.tipo === "lei_federal")) {
          relationType = "regulates";
        } else if (fromNorma.tipo === "instrucao_normativa" && (toNorma.tipo === "lei" || toNorma.tipo === "lei_federal")) {
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

  // ═══════════════════════════════════════════════════════════════════════════
  // DOMAIN RULE: Force all DECRETOs to connect to Lei 14.133/2021
  // This is a mandatory structural rule - every decreto MUST have this edge
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Find Lei 14.133 node ID (could be virtual "lei14133" or a real DB ID)
  let lei14133Id: string | null = "lei14133"; // Default virtual ID
  for (const [normalizedNum, n] of normaByNormalizedNumero) {
    if (normalizedNum.includes("141332021") || n.numero?.includes("14.133")) {
      lei14133Id = n.id;
      break;
    }
  }
  
  // Track which decretos already have a connection to Lei 14.133
  const decretosWithLei14133Edge = new Set<string>();
  for (const edge of edges) {
    if (edge.to_act === lei14133Id || edge.to_act === "lei14133") {
      decretosWithLei14133Edge.add(edge.from_act);
    }
  }
  
  // Validated decree -> article mappings (explicit domain knowledge)
  // These are manually validated regulatory relationships
  const validatedDecreeArticles: Record<string, string[]> = {
    "67.985": ["art.20"],  // Decreto 67.985/2023 -> art. 20 da Lei 14.133
    "67.888": ["art.23"],  // Decreto 67.888/2023 -> art. 23 da Lei 14.133
    "67.689": ["art.12"],  // Decreto 67.689/2023 -> art. 12 da Lei 14.133
    "68.017": ["art.18"],  // Decreto 68.017/2023 -> art. 18 da Lei 14.133
    "68.220": ["art.8"],   // Decreto 68.220/2023 -> art. 8 da Lei 14.133
    "68.304": ["art.74", "art.75"], // Decreto 68.304/2024 -> arts. 74 e 75
    "68.422": ["art.31"],  // Decreto 68.422/2024 -> art. 31
    "69.233": ["art.174"], // Decreto 69.233/2024 -> art. 174

    // NOVAS RELAÇÕES (toggle "Regulamenta")
    "12.807": ["art.182"], // Decreto 12.807/2025 -> art. 182
    "11.878": ["art.79"],  // Decreto 11.878/2024 -> art. 79
    "11.462": ["art.82", "art.83", "art.84", "art.85", "art.86"], // Decreto 11.462/2023 -> arts. 82-86
    "68.861": ["art.25", "art.60", "art.156"], // Decreto 68.861 -> arts. 25, 60, 156
    "69.861": ["art.25", "art.60", "art.156"], // Decreto 69.861 -> arts. 25, 60, 156
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CORREÇÃO CIRÚRGICA: Garantir Decreto 12.807/2025 presente nos nodes
  // ID fixo: 320a1fc8-e325-4bf4-9f0f-b811eb5ce677
  // ═══════════════════════════════════════════════════════════════════════════
  const DECRETO_12807_ID = "320a1fc8-e325-4bf4-9f0f-b811eb5ce677";
  const decreto12807 = nodes.find((n) => n.id === DECRETO_12807_ID || n.numero?.includes("12.807"));
  
  if (decreto12807) {
    console.log(`[CORREÇÃO 12.807] Decreto nº 12.807 encontrado no banco: id=${decreto12807.id}, numero=${decreto12807.numero}`);
  } else {
    console.warn(`[CORREÇÃO 12.807] ATENÇÃO: Decreto nº 12.807 NÃO encontrado nos nodes! Verificar banco de dados.`);
  }
  
  // Ensure validated article edges exist for decretos (domain knowledge)
  // and ensure every decreto has at least one structural edge to Lei 14.133.
  for (const norma of (normas || [])) {
    if (norma.tipo !== "decreto") continue;

    // Check if this decreto has validated article mappings
    const numeroKey = Object.keys(validatedDecreeArticles).find((key) => {
      const normaNorm = normalizeNumero(norma.numero || "");
      const keyNorm = normalizeNumero(key);
      return normaNorm.includes(keyNorm);
    });
    const articles = numeroKey ? validatedDecreeArticles[numeroKey] : null;

    // Track if there is ANY edge from this decreto to Lei 14.133 (either extracted or forced)
    let hasAnyEdgeToLei14133 = decretosWithLei14133Edge.has(norma.id);

    // 1) Always add validated article edges when available (even if a structural edge already exists)
    if (articles && articles.length > 0) {
      const alreadyHasAnyValidatedAnchor = edges.some((e) => {
        if (e.from_act !== norma.id) return false;
        if (e.to_act !== (lei14133Id || "lei14133") && e.to_act !== "lei14133") return false;
        return (e.evidences || []).some((ev) => articles.includes(ev.to_anchor));
      });

      if (!alreadyHasAnyValidatedAnchor) {
        console.log(
          `Adding validated article edges: Decreto ${norma.numero} -> Lei 14.133 [${articles.join(", ")}]`
        );
        edges.push({
          from_act: norma.id,
          to_act: lei14133Id || "lei14133",
          relation_type: "regulates",
          evidences: articles.map((art) => ({
            from_anchor: "ementa",
            to_anchor: art,
            excerpt: `Regulamenta o ${art} da Lei federal nº 14.133, de 1º de abril de 2021`,
          })),
        });
      }

      hasAnyEdgeToLei14133 = true;
    }

    // 2) If it still has no connection at all, force the generic structural edge
    if (!hasAnyEdgeToLei14133) {
      console.log(`Forcing structural edge: Decreto ${norma.numero} -> Lei 14.133/2021 (domain rule)`);
      edges.push({
        from_act: norma.id,
        to_act: lei14133Id || "lei14133",
        relation_type: "regulates",
        evidences: [
          {
            from_anchor: "",
            to_anchor: "",
            excerpt: "[Conexão estrutural obrigatória - Lei de Licitações]",
          },
        ],
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
