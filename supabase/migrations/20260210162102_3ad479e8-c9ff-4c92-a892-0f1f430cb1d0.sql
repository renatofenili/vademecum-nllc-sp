
-- Adicionar coluna para path do vídeo no storage
ALTER TABLE public.normas ADD COLUMN video_storage_path text;

-- Criar bucket para vídeos explicativos
INSERT INTO storage.buckets (id, name, public) VALUES ('normas-videos', 'normas-videos', true);

-- Políticas de acesso ao bucket
CREATE POLICY "Vídeos são públicos para leitura"
ON storage.objects FOR SELECT
USING (bucket_id = 'normas-videos');

CREATE POLICY "Admins podem fazer upload de vídeos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'normas-videos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem deletar vídeos"
ON storage.objects FOR DELETE
USING (bucket_id = 'normas-videos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem atualizar vídeos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'normas-videos' AND public.has_role(auth.uid(), 'admin'));
