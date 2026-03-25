import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  console.log("open-document request", { method: req.method, url: req.url });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        ...corsHeaders,
        "allow": "GET, HEAD, OPTIONS",
      },
    });
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

  const forwardedHeaders = new Headers();
  const rangeHeader = req.headers.get("range");
  const acceptHeader = req.headers.get("accept");

  if (rangeHeader) forwardedHeaders.set("range", rangeHeader);
  if (acceptHeader) forwardedHeaders.set("accept", acceptHeader);
  forwardedHeaders.set(
    "user-agent",
    "Mozilla/5.0 (compatible; LovableDocumentProxy/1.0; +https://lovable.dev)"
  );

  let upstreamResponse: Response;
  const fetchTimeout = AbortSignal.timeout(15000);

  try {
    console.log("open-document fetch:start", { target: parsedTarget.toString() });
    upstreamResponse = await fetch(parsedTarget.toString(), {
      method: req.method,
      headers: forwardedHeaders,
      redirect: "follow",
      signal: fetchTimeout,
    });
    console.log("open-document fetch:done", {
      status: upstreamResponse.status,
      contentType: upstreamResponse.headers.get("content-type"),
    });
  } catch {
    return new Response("Unable to fetch document", {
      status: 502,
      headers: corsHeaders,
    });
  }

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    return new Response("Document unavailable", {
      status: upstreamResponse.status,
      headers: corsHeaders,
    });
  }

  const responseHeaders = new Headers(corsHeaders);
  const contentType = upstreamResponse.headers.get("content-type") ?? "application/pdf";
  const contentLength = upstreamResponse.headers.get("content-length");
  const contentRange = upstreamResponse.headers.get("content-range");
  const acceptRanges = upstreamResponse.headers.get("accept-ranges");
  const lastModified = upstreamResponse.headers.get("last-modified");
  const etag = upstreamResponse.headers.get("etag");

  responseHeaders.set("content-type", contentType);
  responseHeaders.set("content-disposition", "inline");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");

  if (contentLength) responseHeaders.set("content-length", contentLength);
  if (contentRange) responseHeaders.set("content-range", contentRange);
  if (acceptRanges) responseHeaders.set("accept-ranges", acceptRanges);
  if (lastModified) responseHeaders.set("last-modified", lastModified);
  if (etag) responseHeaders.set("etag", etag);

  const responseBody = req.method === "HEAD" ? null : await upstreamResponse.arrayBuffer();

  if (responseBody) {
    responseHeaders.set("content-length", String(responseBody.byteLength));
  }

  return new Response(responseBody, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
});