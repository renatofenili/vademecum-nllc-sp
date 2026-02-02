-- Adicionar colunas de vigência (data_publicacao já existe)
ALTER TABLE public.normas
  ADD COLUMN IF NOT EXISTS inicio_vigencia date,
  ADD COLUMN IF NOT EXISTS fim_vigencia date;

-- Regras de validação:
-- 1) fim_vigencia não pode ser antes de inicio_vigencia
-- 2) inicio_vigencia não pode ser antes da publicação (se ambas existirem)
ALTER TABLE public.normas
  ADD CONSTRAINT normas_vigencia_check
  CHECK (
    (inicio_vigencia IS NULL OR data_publicacao IS NULL OR inicio_vigencia >= data_publicacao)
    AND
    (fim_vigencia IS NULL OR inicio_vigencia IS NULL OR fim_vigencia >= inicio_vigencia)
  );