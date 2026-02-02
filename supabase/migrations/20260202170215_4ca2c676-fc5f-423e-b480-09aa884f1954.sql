-- Adicionar coluna orgao_emissor
ALTER TABLE public.normas
  ADD COLUMN IF NOT EXISTS orgao_emissor text;

-- Constraint com lista fechada de órgãos emissores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'normas_orgao_emissor_check'
  ) THEN
    ALTER TABLE public.normas
      ADD CONSTRAINT normas_orgao_emissor_check
      CHECK (
        orgao_emissor IS NULL
        OR orgao_emissor IN (
          'Governo do Estado de São Paulo',
          'Casa Civil',
          'Procuradoria Geral do Estado',
          'Controladoria Geral do Estado',
          'Secretaria de Gestão e Governo Digital',
          'Governo Federal'
        )
      );
  END IF;
END $$;