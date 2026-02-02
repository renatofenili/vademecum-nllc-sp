-- Adiciona coluna tema (taxonomia de lista fechada)
ALTER TABLE public.normas
  ADD COLUMN IF NOT EXISTS tema text;

-- Regra permissiva: aceita NULL ou um dos temas da lista
ALTER TABLE public.normas
  ADD CONSTRAINT normas_tema_check
  CHECK (
    tema IS NULL
    OR tema IN (
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
      'Impugnação / pedido de esclarecimento',
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
    )
  );

-- Índice para filtros e cruzamentos rápidos por tema
CREATE INDEX IF NOT EXISTS idx_normas_tema
  ON public.normas (tema);