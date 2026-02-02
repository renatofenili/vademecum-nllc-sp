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
  ementa: string;
  link_externo: string | null;
  status: string | null;
  observacoes: string | null;
  created_at: string;
}

const normTypeLabels: Record<NormType, string> = {
  decreto: 'Decreto',
  resolucao: 'Resolução',
  portaria: 'Portaria',
  lei: 'Lei',
  instrucao_normativa: 'Instrução Normativa',
  outro: 'Outro',
};

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
    ementa: '',
    link_externo: '',
    status: 'publicada' as NormStatus,
    observacoes: '',
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
      ementa: '',
      link_externo: '',
      status: 'publicada',
      observacoes: '',
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
        ementa: norma.ementa,
        link_externo: norma.link_externo || '',
        status: (norma.status as NormStatus) || 'publicada',
        observacoes: norma.observacoes || '',
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
            ementa: formData.ementa.trim(),
            link_externo: formData.link_externo.trim() || null,
            status: formData.status,
            observacoes: formData.observacoes.trim() || null,
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
            ementa: formData.ementa.trim(),
            link_externo: formData.link_externo.trim() || null,
            status: formData.status,
            observacoes: formData.observacoes.trim() || null,
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
                        onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
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
                          {Object.entries(normTypeLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="data_publicacao">Data de Publicação *</Label>
                    <Input
                      id="data_publicacao"
                      type="date"
                      value={formData.data_publicacao}
                      onChange={(e) => setFormData({ ...formData, data_publicacao: e.target.value })}
                      required
                    />
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
                      <Label htmlFor="link_externo">Link Externo</Label>
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
