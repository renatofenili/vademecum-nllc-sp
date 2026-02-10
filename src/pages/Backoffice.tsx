import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { getSafeErrorMessage } from '@/lib/errorHandling';
import { FileText, Plus, Trash2, Edit, LogOut, Loader2, ArrowLeft } from 'lucide-react';
import { formatDateBR } from '@/lib/date';

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
  tema: unknown;
  created_at: string;
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
      console.error('Erro ao carregar normas:', error);
      toast({
        title: 'Erro ao carregar normas',
        description: getSafeErrorMessage(error, { operation: 'carregar', entity: 'normas' }),
        variant: 'destructive',
      });
    } else {
      setNormas(data || []);
    }
    setIsLoadingNormas(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta norma?')) return;

    const { error } = await supabase.from('normas').delete().eq('id', id);

    if (error) {
      console.error('Erro ao excluir norma:', error);
      toast({
        title: 'Erro ao excluir',
        description: getSafeErrorMessage(error, { operation: 'excluir', entity: 'norma' }),
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
              Backoffice - <em>Vade Mecum</em>
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
            <Button onClick={() => navigate('/backoffice/norma/nova')}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Norma
            </Button>
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
                      <TableHead>Tipo</TableHead>
                      <TableHead>Número</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="max-w-md">Ementa</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {normas.map((norma) => (
                      <TableRow key={norma.id}>
                        <TableCell>{normTypeLabels[norma.tipo]}</TableCell>
                        <TableCell className="font-medium">{norma.numero}</TableCell>
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
                              onClick={() => navigate(`/backoffice/norma/${norma.id}`)}
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
