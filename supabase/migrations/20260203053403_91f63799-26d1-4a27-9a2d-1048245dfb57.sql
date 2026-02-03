-- Criar bucket privado para PDFs das normas
INSERT INTO storage.buckets (id, name, public)
VALUES ('normas-pdf', 'normas-pdf', false)
ON CONFLICT (id) DO NOTHING;

-- Política de leitura: todos podem ver (normas são públicas)
CREATE POLICY "PDFs de normas são públicos para leitura"
ON storage.objects FOR SELECT
USING (bucket_id = 'normas-pdf');

-- Política de upload: apenas admins
CREATE POLICY "Admins podem fazer upload de PDFs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'normas-pdf' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Política de atualização: apenas admins
CREATE POLICY "Admins podem atualizar PDFs"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'normas-pdf' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Política de exclusão: apenas admins
CREATE POLICY "Admins podem deletar PDFs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'normas-pdf' 
  AND public.has_role(auth.uid(), 'admin')
);