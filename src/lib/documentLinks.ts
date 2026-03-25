export const buildDocumentProxyUrl = (targetUrl: string) => {
  const encodedTarget = btoa(targetUrl);

  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/open-document?u=${encodeURIComponent(encodedTarget)}`;
};