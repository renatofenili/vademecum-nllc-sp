import { useState, useEffect, useCallback } from "react";
import { TreeDeciduous, Maximize2, Minimize2 } from "lucide-react";
import logoSP from "@/assets/logo-sp-governo.png.asset.json";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { RadialHierarchyView } from "@/components/graph/RadialHierarchyView";
import { ActsGraphData } from "@/components/graph/types";
import { cn } from "@/lib/utils";
const MapasTab = () => {
  const [actsData, setActsData] = useState<ActsGraphData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);

  // Load acts graph on mount - CF/88 is always root
  useEffect(() => {
    const loadActsGraph = async () => {
      setIsLoading(true);
      setFallbackMode(false);

      // 1) Prefer backend graph (richer edges)
      try {
        const {
          data,
          error
        } = await supabase.functions.invoke("graph-acts", {
          body: {
            root: "cf88",
            depth: 3
          }
        });
        if (error) throw error;
        if (!data || !Array.isArray((data as any).nodes)) {
          throw new Error("Resposta inválida do backend (nodes ausente)");
        }
        setActsData(data as ActsGraphData);
        setIsLoading(false);
        return;
      } catch (err) {
        console.error("Erro ao carregar mapa normativo:", err);
      }

      // 2) Fallback: build a minimal graph from database so the UI never stays empty
      try {
        const {
          data: normas,
          error: normasError
        } = await supabase.from("normas").select("id, tipo, numero, ementa, orgao_emissor, data_publicacao, status").order("data_publicacao", {
          ascending: false
        }).limit(1000);
        if (normasError) throw normasError;
        const cfNode: ActsGraphData["nodes"][number] = {
          id: "cf88",
          tipo: "constituicao",
          numero: "CF/1988",
          ementa: "Constituição da República Federativa do Brasil de 1988",
          orgao_emissor: "Assembleia Nacional Constituinte",
          data_publicacao: "1988-10-05",
          status: "vigente"
        };

        // Check if Lei 14.133 exists in the database
        const lei14133Exists = (normas || []).some((n: any) => n.numero?.includes("14.133") || n.numero?.includes("14133"));

        // Create virtual Lei 14.133 node if it doesn't exist
        // CRITICAL: This ensures Decretos have a Law to connect to, never directly to CF
        const lei14133Node: ActsGraphData["nodes"][number] = {
          id: "lei14133",
          tipo: "lei_federal",
          numero: "14.133/2021",
          ementa: "Lei de Licitações e Contratos Administrativos",
          orgao_emissor: "Governo Federal",
          data_publicacao: "2021-04-01",
          status: "vigente"
        };
        const baseNodes = lei14133Exists ? [cfNode, ...(normas as any[] || [])] : [cfNode, lei14133Node, ...(normas as any[] || [])];
        const nodes = baseNodes as ActsGraphData["nodes"];
        setActsData({
          root: "cf88",
          nodes,
          edges: []
        });
        setFallbackMode(true);
      } catch (fallbackErr) {
        console.error("Fallback do mapa também falhou:", fallbackErr);
        setActsData(null);
      } finally {
        setIsLoading(false);
      }
    };
    loadActsGraph();
  }, []);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    if (isFullscreen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when fullscreen
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Fullscreen view
  if (isFullscreen) {
    return <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Fullscreen header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <TreeDeciduous className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">Mapa Conceitual Normativo</span>
          </div>
          <Button variant="outline" size="sm" onClick={toggleFullscreen} className="gap-2">
            <Minimize2 className="h-4 w-4" />
            Sair da Tela Cheia
          </Button>
        </div>
        
        {/* Fullscreen map */}
        <div className="flex-1 overflow-hidden">
          <RadialHierarchyView data={actsData} isLoading={isLoading} />
        </div>
        
        {/* Fullscreen footer */}
        <div className="flex justify-center py-2 border-t border-border bg-muted/30">
          <span className="text-sm text-muted-foreground">
            🖱️ Arraste para navegar • Scroll para zoom • Hover para detalhes • ESC para sair
          </span>
        </div>
      </div>;
  }

  // Normal view
  return <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-8 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <TreeDeciduous className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Mapa Conceitual Normativo
            </h1>
            <img src={logoSP.url} alt="Governo do Estado de São Paulo" className="h-12 md:h-14 w-auto object-contain" />
          </div>
          <p className="text-muted-foreground text-lg">Hierarquia normativa em anéis concêntricos</p>
        </div>
      </div>

      {/* Map container */}
      <Card className="min-h-[700px] flex flex-col overflow-hidden relative">
        {/* Fullscreen button */}
        <Button variant="outline" size="sm" onClick={toggleFullscreen} className="absolute top-3 right-3 z-10 gap-2 bg-background/80 backdrop-blur-sm">
          <Maximize2 className="h-4 w-4" />
          Tela Cheia
        </Button>

        {fallbackMode && <div className="absolute left-3 bottom-3 z-10 rounded-md border border-border bg-muted/70 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm">
            Modo contingência: exibindo hierarquia básica (conexões por referência indisponíveis).
          </div>}

        <CardContent className="flex-1 flex flex-col p-0">
          <RadialHierarchyView data={actsData} isLoading={isLoading} />
        </CardContent>
      </Card>

      {/* Instructions */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-6 text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
          <span>🖱️ Arraste para navegar • Scroll para zoom • Hover para detalhes</span>
        </div>
      </div>
    </div>;
};
export default MapasTab;