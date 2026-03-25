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

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      location: parsedTarget.toString(),
      "cache-control": "no-store",
    },
  });
});