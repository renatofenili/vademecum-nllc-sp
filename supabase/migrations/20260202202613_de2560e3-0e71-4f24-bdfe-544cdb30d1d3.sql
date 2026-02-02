-- Remove a constraint antiga de valor único
ALTER TABLE public.normas DROP CONSTRAINT IF EXISTS normas_tema_check;

-- Altera a coluna para armazenar array de temas como JSONB
ALTER TABLE public.normas 
  ALTER COLUMN tema TYPE jsonb USING 
    CASE 
      WHEN tema IS NULL THEN NULL 
      ELSE jsonb_build_array(tema) 
    END;

-- Índice GIN para buscas eficientes em arrays JSONB
DROP INDEX IF EXISTS idx_normas_tema;
CREATE INDEX idx_normas_tema ON public.normas USING GIN (tema);