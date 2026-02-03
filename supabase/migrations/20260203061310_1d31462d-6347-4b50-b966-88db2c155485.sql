-- Adicionar campo para armazenar remissões normativas extraídas
ALTER TABLE public.normas
ADD COLUMN IF NOT EXISTS remissoes_extraidas jsonb DEFAULT NULL;

-- Adicionar campo para status da extração de remissões
ALTER TABLE public.normas
ADD COLUMN IF NOT EXISTS remissoes_status text DEFAULT NULL;

-- Adicionar campo para data da extração de remissões
ALTER TABLE public.normas
ADD COLUMN IF NOT EXISTS remissoes_extraidas_em timestamp with time zone DEFAULT NULL;

-- Adicionar trigger de validação para remissoes_status
CREATE OR REPLACE FUNCTION public.validate_remissoes_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  IF NEW.remissoes_status IS NOT NULL 
     AND NEW.remissoes_status NOT IN ('pendente', 'extraido', 'erro') THEN
    RAISE EXCEPTION 'remissoes_status deve ser pendente, extraido ou erro';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_remissoes_status_trigger
BEFORE INSERT OR UPDATE ON public.normas
FOR EACH ROW
EXECUTE FUNCTION public.validate_remissoes_status();

-- Comentários descritivos
COMMENT ON COLUMN public.normas.remissoes_extraidas IS 'JSON com todas as remissões normativas extraídas do texto';
COMMENT ON COLUMN public.normas.remissoes_status IS 'Status da extração: pendente, extraido, erro';
COMMENT ON COLUMN public.normas.remissoes_extraidas_em IS 'Data/hora da última extração de remissões';