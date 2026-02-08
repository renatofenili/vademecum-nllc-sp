-- Create a generated column for full-text search vector
ALTER TABLE public.normas 
ADD COLUMN IF NOT EXISTS search_vector tsvector 
GENERATED ALWAYS AS (
  setweight(to_tsvector('portuguese', coalesce(numero, '')), 'A') ||
  setweight(to_tsvector('portuguese', coalesce(ementa, '')), 'B') ||
  setweight(to_tsvector('portuguese', coalesce(orgao_emissor, '')), 'C') ||
  setweight(to_tsvector('portuguese', coalesce(observacoes, '')), 'C') ||
  setweight(to_tsvector('portuguese', coalesce(analise_norma, '')), 'C') ||
  setweight(to_tsvector('portuguese', coalesce(texto_extraido, '')), 'D')
) STORED;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_normas_search_vector ON public.normas USING GIN (search_vector);

-- Also add btree indexes for common filters and sorting
CREATE INDEX IF NOT EXISTS idx_normas_data_publicacao ON public.normas (data_publicacao DESC);
CREATE INDEX IF NOT EXISTS idx_normas_tipo ON public.normas (tipo);