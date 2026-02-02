-- Adicionar colunas status e observacoes
ALTER TABLE public.normas
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS observacoes text;

-- Valor padrão para novos registros
ALTER TABLE public.normas
  ALTER COLUMN status SET DEFAULT 'publicada';

-- Regra para evitar valores inválidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'normas_status_check'
  ) THEN
    ALTER TABLE public.normas
      ADD CONSTRAINT normas_status_check
      CHECK (
        status IS NULL
        OR status IN ('rascunho', 'publicada', 'revogada', 'suspensa')
      );
  END IF;
END $$;