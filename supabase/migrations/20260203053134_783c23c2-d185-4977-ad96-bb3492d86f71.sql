-- BACKOFFICE | PDF upload - metadados adicionais
-- pdf_url e pdf_upload_em já existem, adicionando os novos campos

ALTER TABLE public.normas
  ADD COLUMN IF NOT EXISTS pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS pdf_nome_arquivo text,
  ADD COLUMN IF NOT EXISTS pdf_tamanho bigint,
  ADD COLUMN IF NOT EXISTS pdf_mime_type text;