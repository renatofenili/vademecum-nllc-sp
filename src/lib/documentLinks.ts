const OPEN_DOCUMENT_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/open-document`;

export const buildDocumentProxyUrl = (targetUrl: string) => {
  const encodedTarget = btoa(targetUrl);

  return `${OPEN_DOCUMENT_ENDPOINT}?u=${encodeURIComponent(encodedTarget)}`;
};