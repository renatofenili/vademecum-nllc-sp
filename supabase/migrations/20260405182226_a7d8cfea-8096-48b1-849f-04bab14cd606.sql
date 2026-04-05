
CREATE TABLE public.edital_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.edital_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read edital jobs" ON public.edital_jobs
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert edital jobs" ON public.edital_jobs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update edital jobs" ON public.edital_jobs
  FOR UPDATE USING (true);

-- Auto-cleanup jobs older than 1 hour
CREATE INDEX idx_edital_jobs_created_at ON public.edital_jobs (created_at);
