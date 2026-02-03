-- Corrige search_path da função de validação
CREATE OR REPLACE FUNCTION public.validate_texto_extraido_status()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.texto_extraido_status IS NOT NULL 
     AND NEW.texto_extraido_status NOT IN ('pendente', 'extraido', 'erro') THEN
    RAISE EXCEPTION 'texto_extraido_status deve ser pendente, extraido ou erro';
  END IF;
  RETURN NEW;
END;
$$;