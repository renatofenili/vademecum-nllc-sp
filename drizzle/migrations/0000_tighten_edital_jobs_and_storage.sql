DROP POLICY IF EXISTS "Anyone can update edital jobs" ON public.edital_jobs;
DROP POLICY IF EXISTS "Anyone can insert edital jobs" ON public.edital_jobs;
DROP POLICY IF EXISTS "Anyone can read edital jobs" ON public.edital_jobs;
CREATE POLICY "Admins can read edital jobs" ON public.edital_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "PDFs de normas são públicos para leitura" ON storage.objects;
CREATE POLICY "Admins podem ler PDFs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'normas-pdf' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Vídeos são públicos para leitura" ON storage.objects;
CREATE POLICY "Admins podem listar vídeos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'normas-videos' AND public.has_role(auth.uid(), 'admin'));