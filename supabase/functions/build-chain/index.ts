// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChainNode {
  document_id: string;
  anchor: string;
}

interface ChainEdge {
  from_document: string;
  from_anchor: string;
  to_document: string;
  to_anchor: string;
}

interface ChainResult {
  nodes: ChainNode[];
  edges: ChainEdge[];
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
    const { document_id, anchor } = await req.json();

    if (!document_id || !anchor) {
      return new Response(
        JSON.stringify({ error: "document_id and anchor are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Building chain for: ${document_id} / ${anchor}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the norma with extracted references
    const { data: norma, error: fetchError } = await supabase
      .from("normas")
      .select("id, numero, tipo, remissoes_extraidas")
      .eq("id", document_id)
      .single();

    if (fetchError || !norma) {
      console.error("Error fetching norma:", fetchError);
      return new Response(
        JSON.stringify({ error: `Norma not found: ${fetchError?.message}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!norma.remissoes_extraidas) {
      return new Response(
        JSON.stringify({ error: "Norma has no extracted references" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse references
    let allReferences: ExtractedReferences[];
    try {
      allReferences = JSON.parse(norma.remissoes_extraidas);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid remissoes_extraidas format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find references from the starting point
    const startingRefs = allReferences.find(
      (item) => item.from_anchor === anchor && item.from_document === document_id
    );

    // Build nodes and edges
    const nodesMap = new Map<string, ChainNode>();
    const edges: ChainEdge[] = [];

    // Add starting node
    const startKey = `${document_id}::${anchor}`;
    nodesMap.set(startKey, { document_id, anchor });

    if (startingRefs && startingRefs.references) {
      for (const ref of startingRefs.references) {
        // Add edge
        edges.push({
          from_document: document_id,
          from_anchor: anchor,
          to_document: ref.to_document,
          to_anchor: ref.to_anchor,
        });

        // Add target node
        const targetKey = `${ref.to_document}::${ref.to_anchor}`;
        if (!nodesMap.has(targetKey)) {
          nodesMap.set(targetKey, {
            document_id: ref.to_document,
            anchor: ref.to_anchor,
          });
        }
      }
    }

    const result: ChainResult = {
      nodes: Array.from(nodesMap.values()),
      edges,
    };

    console.log(`Chain built: ${result.nodes.length} nodes, ${result.edges.length} edges`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in build-chain:", error);

    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
