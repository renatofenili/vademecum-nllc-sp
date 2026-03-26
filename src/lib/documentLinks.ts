const OPEN_DOCUMENT_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/open-document`;

export const buildDocumentProxyUrl = (targetUrl: string) => {
  const encodedTarget = btoa(targetUrl);

  return `${OPEN_DOCUMENT_ENDPOINT}?u=${encodeURIComponent(encodedTarget)}`;
};

const fetchDocumentBlob = async (targetUrl: string) => {
  const response = await fetch(OPEN_DOCUMENT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
    },
    body: JSON.stringify({ url: targetUrl }),
  });

  if (!response.ok) {
    throw new Error(`Document fetch failed with status ${response.status}`);
  }

  return response.blob();
};

const renderLoadingState = (docWindow: Window) => {
  docWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Abrindo documento...</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: system-ui, sans-serif;
            background: #f8fafc;
            color: #0f172a;
          }
          p {
            margin: 0;
            font-size: 16px;
          }
        </style>
      </head>
      <body>
        <p>Abrindo inteiro teor...</p>
      </body>
    </html>
  `);
  docWindow.document.close();
};

const renderFallbackState = (docWindow: Window, fallbackUrl: string) => {
  docWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Documento indisponível</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            font-family: system-ui, sans-serif;
            background: #f8fafc;
            color: #0f172a;
          }
          main {
            max-width: 720px;
            width: 100%;
            background: white;
            border: 1px solid #cbd5e1;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
          }
          a {
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Não foi possível abrir automaticamente</h1>
          <p>Se o navegador bloquear a visualização, use o link seguro abaixo:</p>
          <p><a href="${fallbackUrl}" target="_self" rel="noreferrer">Abrir documento</a></p>
        </main>
      </body>
    </html>
  `);
  docWindow.document.close();
};

export const openDocumentInNewTab = async (targetUrl: string) => {
  const proxyUrl = buildDocumentProxyUrl(targetUrl);
  const docWindow = window.open("", "_blank");

  if (!docWindow) {
    window.location.assign(proxyUrl);
    return;
  }

  renderLoadingState(docWindow);

  try {
    const documentBlob = await fetchDocumentBlob(targetUrl);
    const objectUrl = URL.createObjectURL(documentBlob);

    docWindow.location.replace(objectUrl);

    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 120000);
  } catch {
    try {
      docWindow.location.replace(proxyUrl);
    } catch {
      renderFallbackState(docWindow, proxyUrl);
    }
  }
};