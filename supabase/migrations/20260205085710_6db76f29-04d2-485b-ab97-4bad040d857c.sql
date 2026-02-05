-- Drop existing constraint
ALTER TABLE public.normas_temas DROP CONSTRAINT normas_temas_tema_check;

-- Recreate constraint with new theme added
ALTER TABLE public.normas_temas ADD CONSTRAINT normas_temas_tema_check CHECK (tema = ANY (ARRAY[
  'Aditivos e apostilamentos'::text,
  'Agentes que atuam no processo de contratação'::text,
  'Análise jurídica'::text,
  'Assinatura de contrato / ata de registro de preços'::text,
  'Aviso de contratação direta'::text,
  'Contrato de eficiência'::text,
  'Contratações sustentáveis'::text,
  'Credenciamento'::text,
  'Critério de julgamento'::text,
  'Dispensa e inexigibilidade de licitação'::text,
  'ETP'::text,
  'Fiscalização contratual'::text,
  'Fase preparatória'::text,
  'Gestão do contrato'::text,
  'Governança'::text,
  'Impugnação / pedido de esclarecimento'::text,
  'Inovação'::text,
  'Minuta de edital'::text,
  'Modalidades'::text,
  'PCA'::text,
  'Pesquisa de Preços'::text,
  'PNCP'::text,
  'Publicação do edital'::text,
  'Reequilíbrio / reajuste / repactuação'::text,
  'Regime de execução'::text,
  'Sanções'::text,
  'Seleção do fornecedor'::text,
  'TR / Projeto Básico'::text
]));