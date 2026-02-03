-- BACKOFFICE | PDF como fonte primária + preparo para extração futura

-- Adiciona colunas para PDF
ALTER TABLE public.normas
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS pdf_hash text,
  ADD COLUMN IF NOT EXISTS pdf_upload_em timestamptz;

-- Adiciona colunas para extração futura (não usar agora)
ALTER TABLE public.normas
  ADD COLUMN IF NOT EXISTS texto_extraido text,
  ADD COLUMN IF NOT EXISTS texto_extraido_origem text,
  ADD COLUMN IF NOT EXISTS texto_extraido_em timestamptz,
  ADD COLUMN IF NOT EXISTS texto_extraido_status text;

-- Status controlado para extração via trigger (check constraints precisam ser imutáveis)
CREATE OR REPLACE FUNCTION public.validate_texto_extraido_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.texto_extraido_status IS NOT NULL 
     AND NEW.texto_extraido_status NOT IN ('pendente', 'extraido', 'erro') THEN
    RAISE EXCEPTION 'texto_extraido_status deve ser pendente, extraido ou erro';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_texto_extraido_status_trigger ON public.normas;
CREATE TRIGGER validate_texto_extraido_status_trigger
  BEFORE INSERT OR UPDATE ON public.normas
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_texto_extraido_status();