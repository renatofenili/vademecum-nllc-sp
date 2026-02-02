import { useEffect, useState } from 'react';
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
import { FileText, Loader2, ArrowLeft, LogOut, Plus, Trash2 } from 'lucide-react';

type NormType = 'decreto' | 'resolucao' | 'portaria' | 'lei' | 'instrucao_normativa' | 'outro';
type NormStatus = 'rascunho' | 'publicada' | 'revogada' | 'suspensa';
type Intensidade = 'fraca' | 'media' | 'forte';

interface TemaComIntensidade {
  tema: string;
  intensidade: Intensidade;
}

const normTypeLabels: Record<NormType, string> = {
  lei: 'Lei',
  decreto: 'Decreto',
  resolucao: 'Resolução',
  portaria: 'Portaria',
  instrucao_normativa: 'Instrução Normativa',
  outro: 'Outro',
};

const normTypeOrder: NormType[] = ['lei', 'decreto', 'resolucao', 'portaria', 'instrucao_normativa', 'outro'];

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
  'TR / Projeto Básico',
];

const intensidadeOptions: { value: Intensidade; label: string }[] = [
  { value: 'fraca', label: 'Fraca' },
  { value: 'media', label: 'Média' },
  { value: 'forte', label: 'Forte' },
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
  
  const [formData, setFormData] = useState({
    numero: '',
    tipo: '' as NormType | '',
    data_publicacao: '',
    inicio_vigencia: '',
    fim_vigencia: '',
    ementa: '',
    link_externo: '',
    status: 'publicada' as NormStatus,
    observacoes: '',
    orgao_emissor: '',
  });
  
  const [temasComIntensidade, setTemasComIntensidade] = useState<TemaComIntensidade[]>([]);

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
        observacoes: normaData.observacoes || '',
        orgao_emissor: normaData.orgao_emissor || '',
      });

      if (temasData && temasData.length > 0) {
        setTemasComIntensidade(
          temasData.map((t) => ({
            tema: t.tema,
            intensidade: t.intensidade as Intensidade,
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

    setIsSubmitting(true);

    try {
      let normaId = id;

      if (isEditing && id) {
        const { error } = await supabase
          .from('normas')
          .update({
            numero: formData.numero.trim(),
            tipo: formData.tipo as NormType,
            data_publicacao: formData.data_publicacao,
            inicio_vigencia: formData.inicio_vigencia || null,
            fim_vigencia: formData.fim_vigencia || null,
            ementa: formData.ementa.trim(),
            link_externo: formData.link_externo.trim() || null,
            status: formData.status,
            observacoes: formData.observacoes.trim() || null,
            orgao_emissor: formData.orgao_emissor || null,
          })
          .eq('id', id);

        if (error) throw error;
      } else {
        const { data: newNorma, error } = await supabase
          .from('normas')
          .insert({
            numero: formData.numero.trim(),
            tipo: formData.tipo as NormType,
            data_publicacao: formData.data_publicacao,
            inicio_vigencia: formData.inicio_vigencia || null,
            fim_vigencia: formData.fim_vigencia || null,
            ementa: formData.ementa.trim(),
            link_externo: formData.link_externo.trim() || null,
            status: formData.status,
            observacoes: formData.observacoes.trim() || null,
            orgao_emissor: formData.orgao_emissor || null,
          })
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
              Backoffice - Vade-Mécum
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

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  placeholder="Notas internas sobre a norma..."
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={3}
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
