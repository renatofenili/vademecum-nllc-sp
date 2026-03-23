
CREATE TABLE public.jurisprudencia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_tc TEXT NOT NULL,
  temas TEXT[] NOT NULL DEFAULT '{}',
  materia TEXT,
  objeto TEXT,
  resumo TEXT,
  sessao_data DATE,
  boletim_referencia TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.jurisprudencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Jurisprudencia visível por todos"
  ON public.jurisprudencia
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins podem inserir jurisprudencia"
  ON public.jurisprudencia
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem atualizar jurisprudencia"
  ON public.jurisprudencia
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem deletar jurisprudencia"
  ON public.jurisprudencia
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_jurisprudencia_temas ON public.jurisprudencia USING GIN (temas);
CREATE INDEX idx_jurisprudencia_sessao_data ON public.jurisprudencia (sessao_data);
