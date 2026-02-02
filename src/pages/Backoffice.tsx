import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { FileText, Plus, Trash2, Edit, LogOut, Loader2, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type NormType = 'decreto' | 'resolucao' | 'portaria' | 'lei' | 'instrucao_normativa' | 'outro';
type NormStatus = 'rascunho' | 'publicada' | 'revogada' | 'suspensa';

interface Norma {
  id: string;
  numero: string;
  tipo: NormType;
  data_publicacao: string;
  inicio_vigencia: string | null;
  fim_vigencia: string | null;
  ementa: string;
  link_externo: string | null;
  status: string | null;
  observacoes: string | null;
  orgao_emissor: string | null;
  tema: string | null;
  created_at: string;
}

const normTypeLabels: Record<NormType, string> = {
  lei: 'Lei',
  decreto: 'Decreto',
  resolucao: 'Resolução',
  portaria: 'Portaria',
  instrucao_normativa: 'Instrução Normativa',
  outro: 'Outro',
};

// Ordem de exibição na combobox
const normTypeOrder: NormType[] = ['lei', 'decreto', 'resolucao', 'portaria', 'instrucao_normativa', 'outro'];

const statusLabels: Record<NormStatus, string> = {
  rascunho: 'Rascunho',
  publicada: 'Publicada',
  revogada: 'Revogada',
  suspensa: 'Suspensa',
};

const statusColors: Record<NormStatus, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  publicada: 'bg-primary/10 text-primary',
  revogada: 'bg-destructive/10 text-destructive',
  suspensa: 'bg-yellow-500/10 text-yellow-600',
};

// Lista de órgãos emissores
const orgaoEmissorOptions = [
  'Governo do Estado de São Paulo',
  'Casa Civil',
  'Procuradoria Geral do Estado',
  'Controladoria Geral do Estado',
  'Secretaria de Gestão e Governo Digital',
  'Governo Federal',
];

// Lista de temas (ordem alfabética)
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
// Máscara para número de norma: apenas separador de milhar (ponto)
const formatNumeroNorma = (value: string): string => {
  // Permite números, pontos e barras
  const cleaned = value.replace(/[^\d./]/g, '');
  
  // Separa a parte antes da barra e depois (se houver)
  const parts = cleaned.split('/');
  let numero = parts[0].replace(/\./g, ''); // remove pontos existentes para reformatar
  const ano = parts[1] || '';
  
  // Adiciona ponto como separador de milhar na parte do número
  if (numero.length > 3) {
    numero = numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  
  // Reconstrói o valor
  if (parts.length > 1) {
    return `${numero}/${ano}`;
  }
  return numero;
};

const Backoffice = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [normas, setNormas] = useState<Norma[]>([]);
  const [isLoadingNormas, setIsLoadingNormas] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNorma, setEditingNorma] = useState<Norma | null>(null);
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
    tema: '',
  });

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
    if (user && isAdmin) {
      fetchNormas();
    }
  }, [user, isAdmin]);

  const fetchNormas = async () => {
    setIsLoadingNormas(true);
    const { data, error } = await supabase
      .from('normas')
      .select('*')
      .order('data_publicacao', { ascending: false });

    if (error) {
      toast({
        title: 'Erro ao carregar normas',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setNormas(data || []);
    }
    setIsLoadingNormas(false);
  };

  const resetForm = () => {
    setFormData({
      numero: '',
      tipo: '',
      data_publicacao: '',
      inicio_vigencia: '',
      fim_vigencia: '',
      ementa: '',
      link_externo: '',
      status: 'publicada',
      observacoes: '',
      orgao_emissor: '',
      tema: '',
    });
    setEditingNorma(null);
  };

  const handleOpenDialog = (norma?: Norma) => {
    if (norma) {
      setEditingNorma(norma);
      setFormData({
        numero: norma.numero,
        tipo: norma.tipo,
        data_publicacao: norma.data_publicacao,
        inicio_vigencia: norma.inicio_vigencia || '',
        fim_vigencia: norma.fim_vigencia || '',
        ementa: norma.ementa,
        link_externo: norma.link_externo || '',
        status: (norma.status as NormStatus) || 'publicada',
        observacoes: norma.observacoes || '',
        orgao_emissor: norma.orgao_emissor || '',
        tema: norma.tema || '',
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
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

    setIsSubmitting(true);

    try {
      if (editingNorma) {
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
            tema: formData.tema || null,
          })
          .eq('id', editingNorma.id);

        if (error) throw error;
        
        toast({
          title: 'Norma atualizada!',
          description: 'A norma foi atualizada com sucesso.',
        });
      } else {
        const { error } = await supabase
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
            tema: formData.tema || null,
          });

        if (error) throw error;
        
        toast({
          title: 'Norma cadastrada!',
          description: 'A norma foi cadastrada com sucesso.',
        });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchNormas();
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

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta norma?')) return;

    const { error } = await supabase.from('normas').delete().eq('id', id);

    if (error) {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Norma excluída',
        description: 'A norma foi excluída com sucesso.',
      });
      fetchNormas();
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
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao site
            </Button>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-2xl">Gerenciar Normas</CardTitle>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Norma
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingNorma ? 'Editar Norma' : 'Cadastrar Nova Norma'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
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

                  <div className="grid grid-cols-2 gap-4">
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
                    <div className="space-y-2">
                      <Label htmlFor="tema">Tema</Label>
                      <Select
                        value={formData.tema}
                        onValueChange={(value) => setFormData({ ...formData, tema: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tema" />
                        </SelectTrigger>
                        <SelectContent>
                          {temaOptions.map((tema) => (
                            <SelectItem key={tema} value={tema}>
                              {tema}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Bloco: Publicação e Vigência */}
                  <div className="space-y-4 rounded-lg border border-border p-4">
                    <h3 className="text-sm font-medium text-foreground">Publicação e Vigência</h3>
                    <div className="grid grid-cols-3 gap-4">
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

                  <div className="grid grid-cols-2 gap-4">
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

                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        editingNorma ? 'Atualizar' : 'Cadastrar'
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {isLoadingNormas ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : normas.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma norma cadastrada.</p>
                <p className="text-sm">Clique em "Nova Norma" para começar.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="max-w-md">Ementa</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {normas.map((norma) => (
                      <TableRow key={norma.id}>
                        <TableCell className="font-medium">{norma.numero}</TableCell>
                        <TableCell>{normTypeLabels[norma.tipo]}</TableCell>
                        <TableCell>
                          {format(new Date(norma.data_publicacao), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {norma.status && statusLabels[norma.status as NormStatus] && (
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusColors[norma.status as NormStatus]}`}>
                              {statusLabels[norma.status as NormStatus]}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-md truncate">{norma.ementa}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(norma)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(norma.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Backoffice;
