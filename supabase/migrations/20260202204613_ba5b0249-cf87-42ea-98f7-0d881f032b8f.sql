-- Cria tabela de relacionamento normas x temas com intensidade
CREATE TABLE IF NOT EXISTS public.normas_temas (
  id bigserial PRIMARY KEY,
  norma_id uuid NOT NULL,
  tema text NOT NULL,
  intensidade text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Foreign key para normas
ALTER TABLE public.normas_temas
  ADD CONSTRAINT normas_temas_norma_fk
  FOREIGN KEY (norma_id) REFERENCES public.normas(id)
  ON DELETE CASCADE;

-- Impede repetir o mesmo tema na mesma norma
ALTER TABLE public.normas_temas
  ADD CONSTRAINT normas_temas_unique
  UNIQUE (norma_id, tema);

-- Intensidade controlada (sem acento no banco; UI pode mostrar "média")
ALTER TABLE public.normas_temas
  ADD CONSTRAINT normas_temas_intensidade_check
  CHECK (intensidade IN ('fraca','media','forte'));

-- Tema controlado (lista fechada)
ALTER TABLE public.normas_temas
  ADD CONSTRAINT normas_temas_tema_check
  CHECK (tema IN (
    'Aditivos e apostilamentos',
    'Análise jurídica',
    'Assinatura de contrato / ata de registro de preços',
    'Aviso de contratação direta',
    'Contrato de eficiência',
    'Contratações sustentáveis',
    'Credenciamento',
    'Critério de julgamento',
    'Dispensa e inexigibilidade de licitação',
    'ETP',
    'Fiscalização contratual',
    'Fase preparatória',
    'Gestão do contrato',
    'Governança',
    'Impugação / pedido de esclarecimento',
    'Inovação',
    'Minuta de edital',
    'Modalidades',
    'PCA',
    'Pesquisa de Preços',
    'PNCP',
    'Publicação do edital',
    'Reequilíbrio / reajuste / repactuação',
    'Regime de execução',
    'Sanções',
    'Seleção do fornecedor',
    'TR / Projeto Básico'
  ));

-- Índices para cruzamentos rápidos
CREATE INDEX IF NOT EXISTS idx_normas_temas_norma_id ON public.normas_temas(norma_id);
CREATE INDEX IF NOT EXISTS idx_normas_temas_tema ON public.normas_temas(tema);
CREATE INDEX IF NOT EXISTS idx_normas_temas_intensidade ON public.normas_temas(intensidade);

-- Habilita RLS
ALTER TABLE public.normas_temas ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Normas_temas são visíveis por todos"
  ON public.normas_temas FOR SELECT
  USING (true);

CREATE POLICY "Admins podem inserir normas_temas"
  ON public.normas_temas FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem atualizar normas_temas"
  ON public.normas_temas FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem deletar normas_temas"
  ON public.normas_temas FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));