
-- Drop the old constraint with typo and recreate with correct spelling
ALTER TABLE public.normas_temas DROP CONSTRAINT IF EXISTS normas_temas_tema_check;

ALTER TABLE public.normas_temas ADD CONSTRAINT normas_temas_tema_check CHECK (
  tema = ANY (ARRAY[
    'Aditivos e apostilamentos'::text, 
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
  ])
);
