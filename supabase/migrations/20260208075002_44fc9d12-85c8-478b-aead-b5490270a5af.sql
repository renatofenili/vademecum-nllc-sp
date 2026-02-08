-- Update the check constraint on normas_temas to include 'Pagamento'
ALTER TABLE public.normas_temas DROP CONSTRAINT IF EXISTS normas_temas_tema_check;

ALTER TABLE public.normas_temas ADD CONSTRAINT normas_temas_tema_check CHECK (
  tema IN (
    'Aditivos e apostilamentos',
    'Agentes que atuam no processo de contratação',
    'Análise jurídica',
    'Assinatura de contrato / ata de registro de preços',
    'Aviso de contratação direta',
    'Controle',
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
    'Pagamento',
    'PCA',
    'Pesquisa de Preços',
    'PNCP',
    'Publicação do edital',
    'Reequilíbrio / reajuste / repactuação',
    'Regime de execução',
    'Sanções',
    'Seleção do fornecedor',
    'Sistema de Registro de Preços',
    'TR / Projeto Básico',
    'Transparência',
    'Valores da Lei nº 14.133/21'
  )
);