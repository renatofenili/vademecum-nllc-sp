-- Tabela: fases do processo com intensidade
CREATE TABLE IF NOT EXISTS public.normas_fases (
  id bigserial PRIMARY KEY,
  norma_id uuid NOT NULL,
  fase text NOT NULL,
  intensidade text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- FK para normas
ALTER TABLE public.normas_fases
  ADD CONSTRAINT normas_fases_norma_fk
  FOREIGN KEY (norma_id) REFERENCES public.normas(id)
  ON DELETE CASCADE;

-- Impede repetir a mesma fase na mesma norma
ALTER TABLE public.normas_fases
  ADD CONSTRAINT normas_fases_unique
  UNIQUE (norma_id, fase);

-- Intensidade controlada
ALTER TABLE public.normas_fases
  ADD CONSTRAINT normas_fases_intensidade_check
  CHECK (intensidade IN ('fraca','media','forte'));

-- Lista fechada de fases do processo
ALTER TABLE public.normas_fases
  ADD CONSTRAINT normas_fases_fase_check
  CHECK (
    fase IN (
      'Planejamento',
      'Fase preparatória',
      'Pesquisa de preços',
      'Seleção do fornecedor',
      'Contratação',
      'Assinatura de contrato / ata de registro de preços',
      'Execução contratual',
      'Fiscalização contratual',
      'Gestão do contrato',
      'Reequilíbrio / reajuste / repactuação',
      'Aditivos e apostilamentos',
      'Sanções',
      'Prestação de contas',
      'Transparência e controle'
    )
  );

-- Índices para análises rápidas
CREATE INDEX IF NOT EXISTS idx_normas_fases_norma_id
  ON public.normas_fases (norma_id);

CREATE INDEX IF NOT EXISTS idx_normas_fases_fase
  ON public.normas_fases (fase);

CREATE INDEX IF NOT EXISTS idx_normas_fases_intensidade
  ON public.normas_fases (intensidade);

-- Habilitar RLS
ALTER TABLE public.normas_fases ENABLE ROW LEVEL SECURITY;

-- RLS: Leitura pública
CREATE POLICY "Normas_fases são visíveis por todos"
  ON public.normas_fases
  FOR SELECT
  USING (true);

-- RLS: Apenas admins podem inserir
CREATE POLICY "Admins podem inserir normas_fases"
  ON public.normas_fases
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Apenas admins podem atualizar
CREATE POLICY "Admins podem atualizar normas_fases"
  ON public.normas_fases
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Apenas admins podem deletar
CREATE POLICY "Admins podem deletar normas_fases"
  ON public.normas_fases
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));