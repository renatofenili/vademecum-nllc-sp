import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um analista jurídico sênior especializado em jurisprudência do TCE/SP sobre licitações (Lei 14.133/2021).
Sua tarefa é ATUALIZAR uma síntese temática existente, incorporando as novas decisões do boletim de ABRIL DE 2026.

REGRAS RÍGIDAS:
1. Preserve INTEGRALMENTE a estrutura Markdown existente (mesmos títulos: "## Tema:" ou "## Síntese...", "### 1. Panorama", "### 2. Principais Apontamentos", "### 3. Convergência de Entendimento", "### 4. Problemas Mais Frequentes", "### 5. Recomendações Práticas").
2. Atualize o número total de ocorrências no Panorama para o valor fornecido.
3. Atualize a janela temporal mencionada (ex.: "Mai/2024 a Abr/2026").
4. Em "Principais Apontamentos", adicione 1 a 3 novos itens refletindo as decisões de abril, citando os números TC EXATAMENTE como aparecem nos dados (ex.: "TC 005123.989.26"). NÃO invente números TC.
5. Em "Convergência", "Problemas Mais Frequentes" e "Recomendações", incorpore ajustes APENAS se as decisões de abril trouxerem nova nuance relevante. Caso contrário, mantenha o texto original.
6. Mantenha o tom técnico-pedagógico em "Linguagem Simples". Evite termos negativos como "risco" — use "atenção".
7. Não remova apontamentos antigos válidos. Apenas adicione/refine.
8. NÃO invente jurisprudência. Use APENAS os TCs fornecidos no bloco de decisões de abril.
9. Retorne APENAS o Markdown atualizado, sem cercas de código, sem comentários.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { theme, existing_content, total_count } = await req.json();
    if (!theme || !existing_content || typeof total_count !== "number") {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Pull April 2026 boletim decisions for this theme
    const { data: aprilDecisions, error: dbErr } = await supabase
      .from("jurisprudencia")
      .select("numero_tc, materia, objeto, resumo, temas, sessao_data")
      .eq("boletim_referencia", "Abril de 2026")
      .contains("temas", [theme])
      .order("sessao_data", { ascending: true });

    if (dbErr) throw new Error("DB error: " + dbErr.message);

    const decisionsBlock = (aprilDecisions ?? []).map((d, i) =>
      `### Decisão ${i + 1} — ${d.numero_tc} (${d.sessao_data})\n` +
      `- Matéria: ${d.materia ?? "—"}\n` +
      `- Objeto: ${d.objeto ?? "—"}\n` +
      `- Temas: ${(d.temas ?? []).join(", ")}\n` +
      `- Resumo: ${d.resumo ?? "—"}`
    ).join("\n\n") || "(Nenhuma decisão nova de abril vinculada a este tema — atualize APENAS o número de ocorrências e a janela temporal, mantendo o restante intacto.)";

    const userPrompt = `# TEMA: ${theme}
# NOVO TOTAL DE OCORRÊNCIAS: ${total_count}
# JANELA TEMPORAL ATUALIZADA: Mai/2024 a Abr/2026
# DECISÕES NOVAS DE ABRIL DE 2026 (${(aprilDecisions ?? []).length} para este tema):

${decisionsBlock}

# SÍNTESE EXISTENTE (a ser atualizada):

${existing_content}

Retorne a síntese atualizada em Markdown, seguindo todas as regras.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      return new Response(JSON.stringify({ error: `AI error ${aiResp.status}: ${txt}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    let content = aiJson.choices?.[0]?.message?.content ?? "";
    content = content.replace(/^```(?:markdown)?\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    return new Response(JSON.stringify({
      theme,
      content,
      april_count: (aprilDecisions ?? []).length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});