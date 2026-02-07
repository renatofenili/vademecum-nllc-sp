-- Atualizar a constraint para incluir o novo tema "Valores da Lei nº 14.133/21"
ALTER TABLE public.normas_temas DROP CONSTRAINT IF EXISTS normas_temas_tema_check;

ALTER TABLE public.normas_temas ADD CONSTRAINT normas_temas_tema_check CHECK (
  tema IN (
    'Aditivos e apostilamentos',
    'Agentes que atuam no processo de contratação',
    'Análise jurídica',
    'Assinatura de contrato / ata de registro de preços',
    'Aviso de contratação direta',
    'Contratações sustentáveis',
    'Contrato de eficiência',
    'Controle',
    'Credenciamento',
    'Critério de julgamento',
    'Dispensa e inexigibilidade de licitação',
    'ETP',
    'Fase preparatória',
    'Fiscalização contratual',
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
    'Sistema de Registro de Preços',
    'TR / Projeto Básico',
    'Transparência',
    'Valores da Lei nº 14.133/21'
  )
);