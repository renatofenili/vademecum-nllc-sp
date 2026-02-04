ALTER TABLE public.normas
  ADD COLUMN IF NOT EXISTS texto_extraido_progresso_atual integer,
  ADD COLUMN IF NOT EXISTS texto_extraido_progresso_total integer,
  ADD COLUMN IF NOT EXISTS texto_extraido_progresso_em timestamptz;
