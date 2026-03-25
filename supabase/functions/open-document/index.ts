import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestUrl = new URL(req.url);
  const encodedTarget = requestUrl.searchParams.get("u");

  if (!encodedTarget) {
    return new Response("Missing document parameter", {
      status: 400,
      headers: corsHeaders,
    });
  }

  let target: string;

  try {
    target = atob(encodedTarget);
  } catch {
    return new Response("Invalid document parameter", {
      status: 400,
      headers: corsHeaders,
    });
  }

  let parsedTarget: URL;

  try {
    parsedTarget = new URL(target);

    if (
      parsedTarget.protocol !== "https:" ||
      !parsedTarget.hostname.endsWith("tce.sp.gov.br")
    ) {
      return new Response("URL not allowed", {
        status: 403,
        headers: corsHeaders,
      });
    }
  } catch {
    return new Response("Invalid URL", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Abrindo documento…</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #0f172a;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(32rem, calc(100vw - 2rem));
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 1rem;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
        padding: 1.5rem;
      }
      h1 { margin: 0 0 0.75rem; font-size: 1.125rem; }
      p { margin: 0 0 1rem; line-height: 1.6; }
      button {
        border: 0;
        border-radius: 999px;
        padding: 0.75rem 1rem;
        background: #0f172a;
        color: #ffffff;
        font: inherit;
        cursor: pointer;
      }
      code {
        display: block;
        margin-top: 1rem;
        padding: 0.75rem;
        background: #f1f5f9;
        border-radius: 0.75rem;
        overflow-wrap: anywhere;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Abrindo o inteiro teor…</h1>
      <p>Se o PDF não abrir automaticamente em alguns instantes, use o botão abaixo.</p>
      <button type="button" id="open-document">Abrir documento oficial</button>
      <code>${parsedTarget.toString()}</code>
    </main>
    <script>
      const target = ${JSON.stringify(parsedTarget.toString())};
      const openDocument = () => window.location.replace(target);
      document.getElementById("open-document")?.addEventListener("click", openDocument);
      setTimeout(openDocument, 60);
    </script>
  </body>
</html>`;

  const responseHeaders = new Headers(corsHeaders);
  responseHeaders.set("Content-Type", "text/html; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");

  return new Response(html, {
    status: 200,
    headers: responseHeaders,
  });
});