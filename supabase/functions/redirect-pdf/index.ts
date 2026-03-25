import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve((req) => {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return new Response("Missing url parameter", { status: 400 });
  }

  // Only allow redirects to TCE/SP domain
  try {
    const parsed = new URL(target);
    if (!parsed.hostname.endsWith("tce.sp.gov.br")) {
      return new Response("URL not allowed", { status: 403 });
    }
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: target },
  });
});
