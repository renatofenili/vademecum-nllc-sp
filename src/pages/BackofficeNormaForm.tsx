import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileText, Loader2, ArrowLeft, LogOut, Plus, Trash2, Upload, X, File, AlertCircle, CheckCircle2, RefreshCw, Video } from 'lucide-react';

type NormType =
  | 'decreto'
  | 'resolucao'
  | 'portaria'
  | 'lei'
  | 'lei_federal'
  | 'lei_estadual'
  | 'instrucao_normativa'
  | 'outro';
type NormStatus = 'rascunho' | 'publicada' | 'revogada' | 'suspensa';
type Intensidade = 'fraca' | 'media' | 'forte';

interface TemaComIntensidade {
  tema: string;
  intensidade: Intensidade;
}

interface FaseComIntensidade {
  fase: string;
  intensidade: Intensidade;
}

const normTypeLabels: Record<NormType, string> = {
  lei: 'Lei',
  lei_federal: 'Lei federal',
  lei_estadual: 'Lei estadual',
  decreto: 'Decreto',
  resolucao: 'Resolução',
  portaria: 'Portaria',
  instrucao_normativa: 'Instrução Normativa',
  outro: 'Outro',
};

const normTypeOrder: NormType[] = [
  'lei_federal',
  'lei_estadual',
  'lei',
  'decreto',
  'resolucao',
  'portaria',
  'instrucao_normativa',
  'outro',
];

const statusLabels: Record<NormStatus, string> = {
  rascunho: 'Rascunho',
  publicada: 'Publicada',
  revogada: 'Revogada',
  suspensa: 'Suspensa',
};

const orgaoEmissorOptions = [
  'Governo do Estado de São Paulo',
  'Casa Civil',
  'Procuradoria Geral do Estado',
  'Controladoria Geral do Estado',
  'Secretaria de Gestão e Governo Digital',
  'Governo Federal',
];

const temaOptions = [
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
  'Valores da Lei nº 14.133/21',
];

const intensidadeOptions: { value: Intensidade; label: string }[] = [
  { value: 'fraca', label: 'Fraca' },
  { value: 'media', label: 'Média' },
  { value: 'forte', label: 'Forte' },
];

const faseOptions = [
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
  'Transparência e controle',
];

const formatNumeroNorma = (value: string): string => {
  const cleaned = value.replace(/[^\d./]/g, '');
  const parts = cleaned.split('/');
  let numero = parts[0].replace(/\./g, '');
  const ano = parts[1] || '';
  
  if (numero.length > 3) {
    numero = numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  
  if (parts.length > 1) {
    return `${numero}/${ano}`;
  }
  return numero;
};

const BackofficeNormaForm = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  
  const isEditing = Boolean(id);
  const [isLoadingNorma, setIsLoadingNorma] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<'pendente' | 'extraido' | 'erro' | null>(null);
  const [extractionStats, setExtractionStats] = useState<{ ementa: number; preambulo: number; artigos: number; incisos: number; paragrafos: number; alineas: number } | null>(null);
  const [extractionOrigin, setExtractionOrigin] = useState<string | null>(null);
  const [extractionProgress, setExtractionProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const autoResumeAttemptedRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const computeExtractionStats = (textoExtraido: unknown) => {
    if (!textoExtraido || typeof textoExtraido !== 'string') return null;
    try {
      const estrutura = JSON.parse(textoExtraido);
      if (!Array.isArray(estrutura)) return null;

      const normalize = (nivel: unknown) => {
        const s = String(nivel ?? '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '');
        if (s === 'ementa') return 'ementa';
        if (s === 'preambulo') return 'preambulo';
        if (s === 'artigo') return 'artigo';
        if (s === 'inciso') return 'inciso';
        if (s === 'paragrafo') return 'paragrafo';
        if (s === 'alinea') return 'alinea';
        return s;
      };

      const stats = {
        ementa: 0,
        preambulo: 0,
        artigos: 0,
        incisos: 0,
        paragrafos: 0,
        alineas: 0,
      };

      for (const item of estrutura as any[]) {
        const n = normalize(item?.nivel);
        if (n === 'ementa') stats.ementa += 1;
        else if (n === 'preambulo') stats.preambulo += 1;
        else if (n === 'artigo') stats.artigos += 1;
        else if (n === 'inciso') stats.incisos += 1;
        else if (n === 'paragrafo') stats.paragrafos += 1;
        else if (n === 'alinea') stats.alineas += 1;
      }

      return stats;
    } catch {
      return null;
    }
  };

  const parseExtractionOrigin = (origin: string | null) => {
    if (!origin) return null;
    // Examples:
    // lovable-ai:...:batched:71-80
    // lovable-ai:...:batched:retryable:71-80:no_tool_args
    const m = origin.match(/\bbatched:(?:retryable:|error:)?(\d+)-(\d+)(?::([a-z_]+))?/i);
    if (!m?.[1] || !m?.[2]) return null;
    return {
      batchStart: Number(m[1]),
      batchEnd: Number(m[2]),
      errorKind: m[3] ?? null,
    };
  };

  const refreshExtractionMeta = async (normaId: string) => {
    const { data, error } = await supabase
      .from('normas')
      .select('texto_extraido_status, texto_extraido, texto_extraido_origem, texto_extraido_progresso_atual, texto_extraido_progresso_total')
      .eq('id', normaId)
      .maybeSingle();

    if (error || !data) return;

    setExtractionStatus((data as any)?.texto_extraido_status ?? null);
    setExtractionStats(computeExtractionStats((data as any)?.texto_extraido));
    setExtractionOrigin((data as any)?.texto_extraido_origem ?? null);

    const progAtual = (data as any)?.texto_extraido_progresso_atual;
    const progTotal = (data as any)?.texto_extraido_progresso_total;
    if (typeof progAtual === 'number' && typeof progTotal === 'number' && progTotal > 0) {
      setExtractionProgress({ current: progAtual, total: progTotal });
    }
  };
  
  const [formData, setFormData] = useState({
    numero: '',
    tipo: '' as NormType | '',
    data_publicacao: '',
    inicio_vigencia: '',
    fim_vigencia: '',
    ementa: '',
    link_externo: '',
    status: 'publicada' as NormStatus,
    analise_norma: '',
    orgao_emissor: '',
  });

  const [pdfData, setPdfData] = useState<{
    pdf_url: string | null;
    pdf_storage_path: string | null;
    pdf_nome_arquivo: string | null;
    pdf_tamanho: number | null;
    pdf_mime_type: string | null;
    pdf_upload_em: string | null;
  }>({
    pdf_url: null,
    pdf_storage_path: null,
    pdf_nome_arquivo: null,
    pdf_tamanho: null,
    pdf_mime_type: null,
    pdf_upload_em: null,
  });
  
  const [temasComIntensidade, setTemasComIntensidade] = useState<TemaComIntensidade[]>([]);
  const [fasesComIntensidade, setFasesComIntensidade] = useState<FaseComIntensidade[]>([]);
  const [videoStoragePath, setVideoStoragePath] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    } else if (!loading && user && !isAdmin) {
      toast({
        title: 'Acesso negado',
        description: 'Você não tem permissão para acessar o backoffice.',
        variant: 'destructive',
      });
      navigate('/');
    }
  }, [user, isAdmin, loading, navigate, toast]);

  useEffect(() => {
    if (user && isAdmin && id) {
      fetchNorma();
    }
  }, [user, isAdmin, id]);

  // Auto-retoma a extração quando ela está marcada como "pendente".
  // Objetivo: evitar que o processo dependa do usuário clicar novamente após alternar janelas/abas.
  useEffect(() => {
    if (!isEditing) return;
    if (!id) return;
    if (!pdfData.pdf_storage_path) return;
    if (isExtractingText) return;

    if (extractionStatus !== 'pendente') {
      autoResumeAttemptedRef.current = false;
      return;
    }

    // Tenta retomar automaticamente ao carregar a página
    if (!autoResumeAttemptedRef.current) {
      autoResumeAttemptedRef.current = true;

      const t = window.setTimeout(() => {
        if (!isMountedRef.current) return;
        if (document.visibilityState !== 'visible') {
          autoResumeAttemptedRef.current = false;
          return;
        }
        console.log('Auto-resuming extraction on page load...');
        triggerTextExtraction(pdfData.pdf_storage_path!, id);
      }, 800);

      return () => window.clearTimeout(t);
    }
  }, [isEditing, id, pdfData.pdf_storage_path, extractionStatus, isExtractingText]);

  // Listener de visibilidade: retoma extração pendente quando o usuário volta para a aba
  useEffect(() => {
    if (!isEditing) return;
    if (!id) return;
    if (!pdfData.pdf_storage_path) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (isExtractingText) return;
      if (extractionStatus !== 'pendente') return;

      console.log('Tab became visible with pending extraction, resuming...');
      // Reset para permitir novo auto-resume
      autoResumeAttemptedRef.current = false;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isEditing, id, pdfData.pdf_storage_path, extractionStatus, isExtractingText]);

  const fetchNorma = async () => {
    setIsLoadingNorma(true);
    
    // Fetch norma data
    const { data: normaData, error: normaError } = await supabase
      .from('normas')
      .select('*')
      .eq('id', id)
      .single();

    if (normaError) {
      toast({
        title: 'Erro ao carregar norma',
        description: normaError.message,
        variant: 'destructive',
      });
      navigate('/backoffice');
      setIsLoadingNorma(false);
      return;
    }

    // Fetch temas from relational table
    const { data: temasData, error: temasError } = await supabase
      .from('normas_temas')
      .select('tema, intensidade')
      .eq('norma_id', id);

    if (temasError) {
      console.error('Erro ao carregar temas:', temasError.message);
    }

    // Fetch fases from relational table
    const { data: fasesData, error: fasesError } = await supabase
      .from('normas_fases')
      .select('fase, intensidade')
      .eq('norma_id', id);

    if (fasesError) {
      console.error('Erro ao carregar fases:', fasesError.message);
    }

    if (normaData) {
      setFormData({
        numero: normaData.numero,
        tipo: normaData.tipo,
        data_publicacao: normaData.data_publicacao,
        inicio_vigencia: normaData.inicio_vigencia || '',
        fim_vigencia: normaData.fim_vigencia || '',
        ementa: normaData.ementa,
        link_externo: normaData.link_externo || '',
        status: (normaData.status as NormStatus) || 'publicada',
        analise_norma: (normaData as any).analise_norma || '',
        orgao_emissor: normaData.orgao_emissor || '',
      });

      // Load PDF data
      setPdfData({
        pdf_url: (normaData as any).pdf_url || null,
        pdf_storage_path: (normaData as any).pdf_storage_path || null,
        pdf_nome_arquivo: (normaData as any).pdf_nome_arquivo || null,
        pdf_tamanho: (normaData as any).pdf_tamanho || null,
        pdf_mime_type: (normaData as any).pdf_mime_type || null,
        pdf_upload_em: (normaData as any).pdf_upload_em || null,
      });

      // Load extraction status and stats
      setExtractionStatus((normaData as any).texto_extraido_status || null);
      setExtractionStats(computeExtractionStats((normaData as any).texto_extraido));
      setExtractionOrigin((normaData as any).texto_extraido_origem || null);

      // Load extraction progress
      const progAtual = (normaData as any).texto_extraido_progresso_atual;
      const progTotal = (normaData as any).texto_extraido_progresso_total;
      if (typeof progAtual === 'number' && typeof progTotal === 'number' && progTotal > 0) {
        setExtractionProgress({ current: progAtual, total: progTotal });
      } else {
        setExtractionProgress(null);
      }

      // Load video
      setVideoStoragePath((normaData as any).video_storage_path || null);

      if (temasData && temasData.length > 0) {
        setTemasComIntensidade(
          temasData.map((t) => ({
            tema: t.tema,
            intensidade: t.intensidade as Intensidade,
          }))
        );
      }

      if (fasesData && fasesData.length > 0) {
        setFasesComIntensidade(
          fasesData.map((f) => ({
            fase: f.fase,
            intensidade: f.intensidade as Intensidade,
          }))
        );
      }
    }
    setIsLoadingNorma(false);
  };

  const handleAddTema = () => {
    setTemasComIntensidade((prev) => [
      ...prev,
      { tema: '', intensidade: 'media' },
    ]);
  };

  const handleRemoveTema = (index: number) => {
    setTemasComIntensidade((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTemaChange = (index: number, field: keyof TemaComIntensidade, value: string) => {
    setTemasComIntensidade((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const getAvailableTemas = (currentIndex: number) => {
    const selectedTemas = temasComIntensidade
      .filter((_, i) => i !== currentIndex)
      .map((t) => t.tema);
    return temaOptions.filter((tema) => !selectedTemas.includes(tema));
  };

  const handleAddFase = () => {
    setFasesComIntensidade((prev) => [
      ...prev,
      { fase: '', intensidade: 'media' },
    ]);
  };

  const handleRemoveFase = (index: number) => {
    setFasesComIntensidade((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFaseChange = (index: number, field: keyof FaseComIntensidade, value: string) => {
    setFasesComIntensidade((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const getAvailableFases = (currentIndex: number) => {
    const selectedFases = fasesComIntensidade
      .filter((_, i) => i !== currentIndex)
      .map((f) => f.fase);
    return faseOptions.filter((fase) => !selectedFases.includes(fase));
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({
        title: 'Tipo de arquivo inválido',
        description: 'Apenas arquivos PDF são aceitos.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingPdf(true);

    try {
      // Remover arquivo anterior do storage se existir
      if (pdfData.pdf_storage_path) {
        try {
          await supabase.storage
            .from('normas-pdf')
            .remove([pdfData.pdf_storage_path]);
        } catch (error) {
          console.error('Erro ao remover PDF anterior:', error);
        }
      }

      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${timestamp}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from('normas-pdf')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('normas-pdf')
        .getPublicUrl(storagePath);

      setPdfData({
        pdf_url: urlData.publicUrl,
        pdf_storage_path: storagePath,
        pdf_nome_arquivo: file.name,
        pdf_tamanho: file.size,
        pdf_mime_type: file.type,
        pdf_upload_em: new Date().toISOString(),
      });

      // Limpar dados de extração anteriores quando um novo PDF é carregado
      setExtractionStatus(null);
      setExtractionStats(null);
      setExtractionOrigin(null);
      setExtractionProgress(null);

      // Persistir imediatamente no backend para garantir que a extração sempre use o ÚLTIMO PDF carregado
      // (mesmo se o usuário não clicar em "Salvar" antes de extrair).
      if (isEditing && id) {
        try {
          await supabase
            .from('normas')
            .update({
              pdf_url: urlData.publicUrl,
              pdf_storage_path: storagePath,
              pdf_nome_arquivo: file.name,
              pdf_tamanho: file.size,
              pdf_mime_type: file.type,
              pdf_upload_em: new Date().toISOString(),
              // Resetar extração para forçar re-extração limpa
              texto_extraido: null,
              texto_extraido_status: null,
              texto_extraido_origem: null,
              texto_extraido_em: null,
              texto_extraido_progresso_atual: null,
              texto_extraido_progresso_total: null,
              texto_extraido_progresso_em: null,
            } as any)
            .eq('id', id);
        } catch (err) {
          console.error('Falha ao persistir PDF no backend:', err);
        }
      }

      toast({
        title: 'PDF carregado!',
        description: 'O arquivo foi enviado com sucesso.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro no upload',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsUploadingPdf(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePdf = async () => {
    // Remover arquivo do storage
    if (pdfData.pdf_storage_path) {
      try {
        await supabase.storage
          .from('normas-pdf')
          .remove([pdfData.pdf_storage_path]);
      } catch (error) {
        console.error('Erro ao remover PDF do storage:', error);
      }
    }

    // Se estiver editando, limpar dados no banco de dados
    if (isEditing && id) {
      try {
        await supabase
          .from('normas')
          .update({
            pdf_url: null,
            pdf_storage_path: null,
            pdf_nome_arquivo: null,
            pdf_tamanho: null,
            pdf_mime_type: null,
            pdf_upload_em: null,
            texto_extraido: null,
            texto_extraido_status: null,
            texto_extraido_origem: null,
            texto_extraido_em: null,
            texto_extraido_progresso_atual: null,
            texto_extraido_progresso_total: null,
          } as any)
          .eq('id', id);
      } catch (error) {
        console.error('Erro ao limpar dados do PDF no banco:', error);
      }
    }

    // Limpar estado local
    setPdfData({
      pdf_url: null,
      pdf_storage_path: null,
      pdf_nome_arquivo: null,
      pdf_tamanho: null,
      pdf_mime_type: null,
      pdf_upload_em: null,
    });
    setExtractionStatus(null);
    setExtractionStats(null);
    setExtractionOrigin(null);
    setExtractionProgress(null);

    toast({
      title: 'PDF removido',
      description: 'O arquivo e a extração foram removidos.',
    });
  };

  const triggerTextExtraction = async (
    storagePath: string,
    normaId: string,
    options?: { reset?: boolean }
  ) => {
    setIsExtractingText(true);
    setExtractionStatus('pendente');
    setExtractionStats(null);
    setExtractionProgress(null);
    
    try {
      console.log('Triggering text extraction for:', normaId, storagePath);
      
      const baseBatchSize = 5;
      let batchSize = baseBatchSize;
      // Safety guard to avoid infinite loops, but high enough to cover long norms.
      // The backend is responsible for signaling completion via `done`.
      const maxBatches = 250;
      let emptyStreak = 0;
      let nextBatchStart: number | null = options?.reset ? 1 : null;
      let retryCount = 0;
      // Max retries for the same batch_start before forcing skip
      const maxRetriesPerBatch = 6;
      let lastFailedBatchStart: number | null = null;

      let done = false;
      for (let i = 0; i < maxBatches; i++) {
        if (!isMountedRef.current) break;

        const { data, error } = await supabase.functions.invoke('extract-pdf-text', {
          body: {
            pdf_storage_path: storagePath,
            norma_id: normaId,
            batch_start: nextBatchStart ?? undefined,
            batch_size: batchSize,
            empty_streak: emptyStreak,
            reset: Boolean(options?.reset) && i === 0,
            // Let backend estimate based on extraction progress; only hint if we have a known value
            expected_total: extractionProgress?.total && extractionProgress.total < 300 ? extractionProgress.total : undefined,
          },
        });

        if (error) {
          console.error('Extraction error:', error);
          // Pode ser timeout/transiente; tenta refletir o que o backend já salvou
          await refreshExtractionMeta(normaId);
          throw error;
        }

        // Friendly non-2xx handling: backend can return { success:false } with 200.
        if ((data as any)?.success === false) {
          await refreshExtractionMeta(normaId);
          const kind = String((data as any)?.error_kind ?? 'unknown');
          const rawMsg = String((data as any)?.error_message ?? 'Falha ao extrair texto do PDF.');
          const msg =
            kind === 'payment_required'
              ? 'Créditos de IA insuficientes para concluir esta extração. Recarregue créditos e tente novamente.'
              : rawMsg;
          throw new Error(msg);
        }

        await refreshExtractionMeta(normaId);

        const retryable = Boolean((data as any)?.retryable);
        const currentBatchStart = (data as any)?.batch_start as number | undefined;
        const currentBatchEnd = (data as any)?.batch_end as number | undefined;
        
        if (retryable) {
          // Track if we're stuck on the same batch
          if (currentBatchStart != null && currentBatchStart === lastFailedBatchStart) {
            retryCount += 1;
          } else {
            retryCount = 1;
            lastFailedBatchStart = currentBatchStart ?? null;
          }

          const retryAfter = Number((data as any)?.retry_after_ms ?? 900);
          const suggestedBatchSize = Number((data as any)?.suggested_batch_size ?? NaN);

          if (Number.isFinite(suggestedBatchSize) && suggestedBatchSize >= 1 && suggestedBatchSize <= 30) {
            batchSize = suggestedBatchSize;
          } else {
            batchSize = Math.max(1, Math.floor(batchSize / 2));
          }

          console.warn('Retryable batch failure', {
            normaId,
            retryCount,
            maxRetriesPerBatch,
            retryAfter,
            batchStart: currentBatchStart,
            batchEnd: currentBatchEnd,
            batchSize,
          });

          // If we've exceeded max retries on the SAME batch, force skip to next batch
          if (retryCount >= maxRetriesPerBatch) {
            console.warn(`Forcing skip past stuck batch ${currentBatchStart}-${currentBatchEnd}`);
            // Force move to next batch (end + 1)
            nextBatchStart = (currentBatchEnd ?? currentBatchStart ?? 1) + 1;
            retryCount = 0;
            lastFailedBatchStart = null;
            batchSize = baseBatchSize; // Reset batch size
            toast({
              title: 'Lote problemático pulado',
              description: `Artigos ${currentBatchStart}-${currentBatchEnd} não puderam ser extraídos e foram pulados.`,
            });
            await sleep(500);
            continue;
          }

          await sleep(Math.max(700, Math.min(5000, retryAfter)));
          continue;
        }

        // Successful batch - reset retry tracking
        retryCount = 0;
        lastFailedBatchStart = null;

        // Se o lote foi concluído, volta gradualmente ao tamanho padrão.
        if (batchSize < baseBatchSize) {
          batchSize = Math.min(baseBatchSize, batchSize + 1);
        }

        const emptyBatch = Boolean((data as any)?.empty_batch);
        const batchDone = Boolean((data as any)?.done);
        const next = (data as any)?.next_batch_start as number | null | undefined;

        emptyStreak = emptyBatch ? emptyStreak + 1 : 0;
        done = batchDone;

        if (done) break;
        if (!next) break;
        nextBatchStart = next;

        // Pequena pausa para reduzir risco de rate-limit
        await sleep(350);
      }

      await refreshExtractionMeta(normaId);

      if (done) {
        toast({
          title: 'Texto extraído!',
          description: 'O texto do PDF foi extraído e estruturado com sucesso.',
        });
      } else {
        toast({
          title: 'Extração em andamento',
          description: 'A extração foi iniciada/atualizada. Reabra esta norma para ver o status final.',
        });
      }
    } catch (error: any) {
      console.error('Extraction failed:', error);
      setExtractionStatus('erro');
      toast({
        title: 'Erro na extração',
        description: error.message || 'Falha ao extrair texto do PDF.',
        variant: 'destructive',
      });
    } finally {
      setIsExtractingText(false);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.numero || !formData.tipo || !formData.data_publicacao || !formData.ementa) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    // Validate temas - all must have tema selected
    const invalidTemas = temasComIntensidade.filter((t) => !t.tema);
    if (invalidTemas.length > 0) {
      toast({
        title: 'Temas incompletos',
        description: 'Selecione um tema para cada linha ou remova as linhas vazias.',
        variant: 'destructive',
      });
      return;
    }

    // Validate fases - all must have fase selected
    const invalidFases = fasesComIntensidade.filter((f) => !f.fase);
    if (invalidFases.length > 0) {
      toast({
        title: 'Fases incompletas',
        description: 'Selecione uma fase para cada linha ou remova as linhas vazias.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      let normaId = id;

      // Detectar se o PDF foi alterado (novo upload)
      const pdfChanged = isEditing && pdfData.pdf_storage_path && 
        pdfData.pdf_upload_em && new Date(pdfData.pdf_upload_em).getTime() > Date.now() - 60000; // Uploaded recently

      const normaPayload: Record<string, unknown> = {
        numero: formData.numero.trim(),
        tipo: formData.tipo as NormType,
        data_publicacao: formData.data_publicacao,
        inicio_vigencia: formData.inicio_vigencia || null,
        fim_vigencia: formData.fim_vigencia || null,
        ementa: formData.ementa.trim(),
        link_externo: formData.link_externo.trim() || null,
        status: formData.status,
        analise_norma: formData.analise_norma.trim() || null,
        orgao_emissor: formData.orgao_emissor || null,
        pdf_url: pdfData.pdf_url,
        pdf_storage_path: pdfData.pdf_storage_path,
        pdf_nome_arquivo: pdfData.pdf_nome_arquivo,
        pdf_tamanho: pdfData.pdf_tamanho,
        pdf_mime_type: pdfData.pdf_mime_type,
        pdf_upload_em: pdfData.pdf_upload_em,
        video_storage_path: videoStoragePath,
      };

      // Se o PDF foi alterado, limpar dados de extração para forçar re-extração limpa
      if (pdfChanged) {
        normaPayload.texto_extraido = null;
        normaPayload.texto_extraido_status = null;
        normaPayload.texto_extraido_origem = null;
        normaPayload.texto_extraido_em = null;
        normaPayload.texto_extraido_progresso_atual = null;
        normaPayload.texto_extraido_progresso_total = null;
      }

      if (isEditing && id) {
        const { error } = await supabase
          .from('normas')
          .update(normaPayload as any)
          .eq('id', id);

        if (error) throw error;
      } else {
        const { data: newNorma, error } = await supabase
          .from('normas')
          .insert(normaPayload as any)
          .select('id')
          .single();

        if (error) throw error;
        normaId = newNorma.id;
      }

      // Handle temas - delete existing and insert new ones
      if (normaId) {
        // Delete existing temas for this norma
        const { error: deleteError } = await supabase
          .from('normas_temas')
          .delete()
          .eq('norma_id', normaId);

        if (deleteError) {
          console.error('Erro ao deletar temas existentes:', deleteError.message);
        }

        // Insert new temas
        if (temasComIntensidade.length > 0) {
          const temasToInsert = temasComIntensidade
            .filter((t) => t.tema)
            .map((t) => ({
              norma_id: normaId,
              tema: t.tema,
              intensidade: t.intensidade,
            }));

          if (temasToInsert.length > 0) {
            const { error: insertError } = await supabase
              .from('normas_temas')
              .insert(temasToInsert);

            if (insertError) throw insertError;
          }
        }

        // Handle fases - delete existing and insert new ones
        const { error: deleteFasesError } = await supabase
          .from('normas_fases')
          .delete()
          .eq('norma_id', normaId);

        if (deleteFasesError) {
          console.error('Erro ao deletar fases existentes:', deleteFasesError.message);
        }

        // Insert new fases
        if (fasesComIntensidade.length > 0) {
          const fasesToInsert = fasesComIntensidade
            .filter((f) => f.fase)
            .map((f) => ({
              norma_id: normaId,
              fase: f.fase,
              intensidade: f.intensidade,
            }));

          if (fasesToInsert.length > 0) {
            const { error: insertFasesError } = await supabase
              .from('normas_fases')
              .insert(fasesToInsert);

            if (insertFasesError) throw insertFasesError;
          }
        }
      }

      // Trigger text extraction if PDF was uploaded and no extraction in progress
      // pdfChanged indica que limpamos os dados de extração anteriores
      const shouldExtract = pdfData.pdf_storage_path && normaId && (!extractionStatus || pdfChanged);
      if (shouldExtract) {
        // Don't wait for extraction, run in background
        triggerTextExtraction(pdfData.pdf_storage_path, normaId, { reset: pdfChanged });
      }

      toast({
        title: isEditing ? 'Norma atualizada!' : 'Norma cadastrada!',
        description: isEditing
          ? 'A norma foi atualizada com sucesso.'
          : 'A norma foi cadastrada com sucesso.',
      });

      navigate('/backoffice');
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading || (!loading && !isAdmin)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoadingNorma) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">
              Backoffice - <em>Vade Mecum</em>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/backoffice')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <CardTitle className="text-2xl">
                {isEditing ? 'Editar Norma' : 'Cadastrar Nova Norma'}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="numero">Número *</Label>
                  <Input
                    id="numero"
                    placeholder="Ex: 67.608/2023"
                    value={formData.numero}
                    onChange={(e) => setFormData({ ...formData, numero: formatNumeroNorma(e.target.value) })}
                    maxLength={12}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo *</Label>
                  <Select
                    value={formData.tipo}
                    onValueChange={(value) => setFormData({ ...formData, tipo: value as NormType })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {normTypeOrder.map((value) => (
                        <SelectItem key={value} value={value}>
                          {normTypeLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="orgao_emissor">Órgão Emissor</Label>
                <Select
                  value={formData.orgao_emissor}
                  onValueChange={(value) => setFormData({ ...formData, orgao_emissor: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o órgão" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgaoEmissorOptions.map((orgao) => (
                      <SelectItem key={orgao} value={orgao}>
                        {orgao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bloco: Temas e Intensidade */}
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">Temas e Intensidade</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddTema}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar tema
                  </Button>
                </div>

                {temasComIntensidade.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum tema adicionado. Clique em "Adicionar tema" para começar.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {temasComIntensidade.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                      >
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Tema</Label>
                            <Select
                              value={item.tema}
                              onValueChange={(value) => handleTemaChange(index, 'tema', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o tema" />
                              </SelectTrigger>
                              <SelectContent>
                                {getAvailableTemas(index).map((tema) => (
                                  <SelectItem key={tema} value={tema}>
                                    {tema}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Intensidade</Label>
                            <Select
                              value={item.intensidade}
                              onValueChange={(value) => handleTemaChange(index, 'intensidade', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {intensidadeOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveTema(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bloco: Fases do Processo */}
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">Fases do Processo</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddFase}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar fase
                  </Button>
                </div>

                {fasesComIntensidade.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma fase adicionada. Clique em "Adicionar fase" para começar.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {fasesComIntensidade.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                      >
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Fase do Processo</Label>
                            <Select
                              value={item.fase}
                              onValueChange={(value) => handleFaseChange(index, 'fase', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione a fase" />
                              </SelectTrigger>
                              <SelectContent>
                                {getAvailableFases(index).map((fase) => (
                                  <SelectItem key={fase} value={fase}>
                                    {fase}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Intensidade</Label>
                            <Select
                              value={item.intensidade}
                              onValueChange={(value) => handleFaseChange(index, 'intensidade', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {intensidadeOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveFase(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bloco: Publicação e Vigência */}
              <div className="space-y-4 rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium text-foreground">Publicação e Vigência</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="data_publicacao">Data de Publicação *</Label>
                    <Input
                      id="data_publicacao"
                      type="date"
                      value={formData.data_publicacao}
                      onChange={(e) => setFormData({ ...formData, data_publicacao: e.target.value })}
                      required
                    />
                    <p className="text-xs text-muted-foreground">Data do DOU / DOE / Diário oficial</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inicio_vigencia">Início da Vigência</Label>
                    <Input
                      id="inicio_vigencia"
                      type="date"
                      value={formData.inicio_vigencia}
                      onChange={(e) => setFormData({ ...formData, inicio_vigencia: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Ex.: "entra em vigor na data de sua publicação" ou data futura</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fim_vigencia">Fim da Vigência</Label>
                    <Input
                      id="fim_vigencia"
                      type="date"
                      value={formData.fim_vigencia}
                      onChange={(e) => setFormData({ ...formData, fim_vigencia: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Ex.: normas temporárias</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ementa">Ementa *</Label>
                <Textarea
                  id="ementa"
                  placeholder="Resumo do conteúdo da norma..."
                  value={formData.ementa}
                  onChange={(e) => setFormData({ ...formData, ementa: e.target.value })}
                  rows={4}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="link_externo">Link da Publicação Oficial</Label>
                  <Input
                    id="link_externo"
                    type="url"
                    placeholder="https://..."
                    value={formData.link_externo}
                    onChange={(e) => setFormData({ ...formData, link_externo: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as NormStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Bloco: Arquivo PDF da Norma */}
              <div className="space-y-4 rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium text-foreground">Arquivo PDF da Norma</h3>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handlePdfUpload}
                />

                {pdfData.pdf_url ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                      <File className="h-8 w-8 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{pdfData.pdf_nome_arquivo}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(pdfData.pdf_tamanho)}
                          {pdfData.pdf_upload_em && (
                            <> • Enviado em {new Date(pdfData.pdf_upload_em).toLocaleDateString('pt-BR')}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a href={pdfData.pdf_url} target="_blank" rel="noopener noreferrer">
                            Visualizar
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={handleRemovePdf}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Extraction Status */}
                    {isEditing && (
                      <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30 border border-border">
                        {isExtractingText ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                            <div className="flex-1 space-y-1">
                              <p className="text-sm font-medium">Extraindo texto...</p>
                              {extractionProgress && extractionProgress.total > 0 ? (
                                <>
                                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                                    <div 
                                      className="h-full bg-primary transition-all duration-300" 
                                      style={{ width: `${Math.min(100, Math.round((extractionProgress.current / extractionProgress.total) * 100))}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {Math.min(100, Math.round((extractionProgress.current / extractionProgress.total) * 100))}% — Artigo {extractionProgress.current} de ~{extractionProgress.total}
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  A IA está analisando e estruturando o conteúdo do PDF
                                </p>
                              )}
                            </div>
                          </>
                        ) : extractionStatus === 'extraido' ? (
                          <>
                            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-primary">Texto extraído</p>
                              {extractionStats && (
                                <p className="text-xs text-muted-foreground">
                                  {extractionStats.ementa > 0 && 'Ementa, '}
                                  {extractionStats.preambulo > 0 && 'Preâmbulo, '}
                                  {extractionStats.artigos} artigo{extractionStats.artigos !== 1 ? 's' : ''}
                                  {extractionStats.paragrafos > 0 && `, ${extractionStats.paragrafos} §`}
                                  {extractionStats.incisos > 0 && `, ${extractionStats.incisos} inciso${extractionStats.incisos !== 1 ? 's' : ''}`}
                                  {extractionStats.alineas > 0 && `, ${extractionStats.alineas} alínea${extractionStats.alineas !== 1 ? 's' : ''}`}
                                </p>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (pdfData.pdf_storage_path && id) {
                                  triggerTextExtraction(pdfData.pdf_storage_path, id, { reset: true });
                                }
                              }}
                              className="shrink-0"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Re-extrair
                            </Button>
                          </>
                        ) : extractionStatus === 'erro' ? (
                          <>
                            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                            <div className="flex-1 space-y-1">
                              <p className="text-sm font-medium text-destructive">Erro na extração</p>
                              <p className="text-xs text-muted-foreground">
                                Não foi possível extrair o texto do PDF
                              </p>
                              {extractionProgress && extractionProgress.total > 0 && (
                                <>
                                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                                    <div
                                      className="h-full bg-primary transition-all duration-300"
                                      style={{
                                        width: `${Math.min(100, Math.round((extractionProgress.current / extractionProgress.total) * 100))}%`,
                                      }}
                                    />
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Último progresso: {Math.min(100, Math.round((extractionProgress.current / extractionProgress.total) * 100))}% — Artigo {extractionProgress.current} de ~{extractionProgress.total}
                                  </p>
                                </>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (pdfData.pdf_storage_path && id) {
                                  triggerTextExtraction(pdfData.pdf_storage_path, id);
                                }
                              }}
                              className="shrink-0"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Tentar novamente
                            </Button>
                          </>
                        ) : extractionStatus === 'pendente' ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                            <div className="flex-1 space-y-1">
                              <p className="text-sm font-medium">Extração pendente</p>
                              {extractionProgress && extractionProgress.total > 0 ? (
                                <>
                                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                                    <div 
                                      className="h-full bg-primary transition-all duration-300" 
                                      style={{ width: `${Math.min(100, Math.round((extractionProgress.current / extractionProgress.total) * 100))}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {Math.min(100, Math.round((extractionProgress.current / extractionProgress.total) * 100))}% — Artigo {extractionProgress.current} de ~{extractionProgress.total}
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  {(() => {
                                    const info = parseExtractionOrigin(extractionOrigin);
                                    if (!info) return 'Aguardando retomada automática…';
                                    const batch = `Último lote: arts. ${info.batchStart}–${info.batchEnd}`;
                                    return info.errorKind ? `${batch} (${info.errorKind})` : batch;
                                  })()}
                                </p>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (pdfData.pdf_storage_path && id) {
                                  autoResumeAttemptedRef.current = true;
                                  triggerTextExtraction(pdfData.pdf_storage_path, id);
                                }
                              }}
                              className="shrink-0"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Continuar
                            </Button>
                          </>
                        ) : (
                          <>
                            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Extração de texto</p>
                              <p className="text-xs text-muted-foreground">
                                O texto será extraído automaticamente ao salvar
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (pdfData.pdf_storage_path && id) {
                                  triggerTextExtraction(pdfData.pdf_storage_path, id);
                                }
                              }}
                              className="shrink-0"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Extrair agora
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploadingPdf ? (
                      <>
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Enviando arquivo...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Clique para selecionar um arquivo PDF
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Apenas arquivos PDF são aceitos
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Bloco: Vídeo Explicativo */}
              <div className="space-y-4 rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium text-foreground">Vídeo Explicativo (Linguagem Simples)</h3>
                
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/ogg"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsUploadingVideo(true);
                    try {
                      // Remove previous video if exists
                      if (videoStoragePath) {
                        try {
                          await supabase.storage.from('normas-videos').remove([videoStoragePath]);
                        } catch (err) {
                          console.error('Erro ao remover vídeo anterior:', err);
                        }
                      }
                      const timestamp = Date.now();
                      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                      const storagePath = `${timestamp}_${sanitizedName}`;
                      const { error: uploadError } = await supabase.storage
                        .from('normas-videos')
                        .upload(storagePath, file, { cacheControl: '3600', upsert: false });
                      if (uploadError) throw uploadError;
                      setVideoStoragePath(storagePath);
                      // Persist immediately if editing
                      if (isEditing && id) {
                        await supabase.from('normas').update({ video_storage_path: storagePath } as any).eq('id', id);
                      }
                      toast({ title: 'Vídeo carregado!', description: 'O vídeo foi enviado com sucesso.' });
                    } catch (error: any) {
                      toast({ title: 'Erro no upload do vídeo', description: error.message, variant: 'destructive' });
                    } finally {
                      setIsUploadingVideo(false);
                      if (videoInputRef.current) videoInputRef.current.value = '';
                    }
                  }}
                />

                {videoStoragePath ? (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                    <Video className="h-8 w-8 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{videoStoragePath.replace(/^\d+_/, '')}</p>
                      <p className="text-xs text-muted-foreground">Vídeo vinculado</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <a
                          href={supabase.storage.from('normas-videos').getPublicUrl(videoStoragePath).data?.publicUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Visualizar
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={async () => {
                          if (videoStoragePath) {
                            try {
                              await supabase.storage.from('normas-videos').remove([videoStoragePath]);
                            } catch (err) {
                              console.error('Erro ao remover vídeo:', err);
                            }
                          }
                          setVideoStoragePath(null);
                          if (isEditing && id) {
                            await supabase.from('normas').update({ video_storage_path: null } as any).eq('id', id);
                          }
                          toast({ title: 'Vídeo removido' });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    onClick={() => videoInputRef.current?.click()}
                  >
                    {isUploadingVideo ? (
                      <>
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Enviando vídeo...</p>
                      </>
                    ) : (
                      <>
                        <Video className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Clique para selecionar um vídeo
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Formatos aceitos: MP4, WebM, OGG
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="analise_norma">Análise da Norma</Label>
                <Textarea
                  id="analise_norma"
                  placeholder="Análise técnica ou jurídica da norma..."
                  value={formData.analise_norma}
                  onChange={(e) => setFormData({ ...formData, analise_norma: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => navigate('/backoffice')}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    isEditing ? 'Atualizar' : 'Cadastrar'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default BackofficeNormaForm;
