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

  const upstreamResponse = await fetch(parsedTarget.toString(), {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; LovableDocumentProxy/1.0)",
      accept: "application/pdf,*/*",
    },
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return new Response("Document unavailable", {
      status: 502,
      headers: corsHeaders,
    });
  }

  const responseHeaders = new Headers(corsHeaders);
  responseHeaders.set(
    "Content-Type",
    upstreamResponse.headers.get("content-type") ?? "application/pdf"
  );
  responseHeaders.set(
    "Content-Disposition",
    `inline; filename="${parsedTarget.pathname.split("/").pop() ?? "documento.pdf"}"`
  );
  responseHeaders.set("Cache-Control", "public, max-age=3600");

  const contentLength = upstreamResponse.headers.get("content-length");
  if (contentLength) {
    responseHeaders.set("Content-Length", contentLength);
  }

  return new Response(upstreamResponse.body, {
    status: 200,
    headers: responseHeaders,
  });
});