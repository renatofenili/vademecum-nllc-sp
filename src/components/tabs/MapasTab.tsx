import { useState, useEffect, useCallback } from "react";
import { TreeDeciduous, Maximize2, Minimize2 } from "lucide-react";
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

  // Load acts graph on mount - CF/88 is always root
  useEffect(() => {
    const loadActsGraph = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("graph-acts", {
          body: { root: "cf88", depth: 3 },
        });

        if (error) throw error;
        setActsData(data);
      } catch (err) {
        console.error("Erro ao carregar mapa normativo:", err);
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
    setIsFullscreen((prev) => !prev);
  }, []);

  // Fullscreen view
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Fullscreen header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <TreeDeciduous className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">Mapa Conceitual Normativo</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            className="gap-2"
          >
            <Minimize2 className="h-4 w-4" />
            Sair da Tela Cheia
          </Button>
        </div>
        
        {/* Fullscreen map */}
        <div className="flex-1 overflow-hidden">
          <RadialHierarchyView
            data={actsData}
            isLoading={isLoading}
          />
        </div>
        
        {/* Fullscreen footer */}
        <div className="flex justify-center py-2 border-t border-border bg-muted/30">
          <span className="text-sm text-muted-foreground">
            🖱️ Arraste para navegar • Scroll para zoom • Hover para detalhes • ESC para sair
          </span>
        </div>
      </div>
    );
  }

  // Normal view
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-8 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <TreeDeciduous className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Mapa Conceitual Normativo
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Hierarquia normativa em anéis concêntricos — CF/88 ao centro
          </p>
        </div>
      </div>

      {/* Map container */}
      <Card className="min-h-[700px] flex flex-col overflow-hidden relative">
        {/* Fullscreen button */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-10 gap-2 bg-background/80 backdrop-blur-sm"
        >
          <Maximize2 className="h-4 w-4" />
          Tela Cheia
        </Button>
        
        <CardContent className="flex-1 flex flex-col p-0">
          <RadialHierarchyView
            data={actsData}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Instructions */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-6 text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
          <span>🖱️ Arraste para navegar • Scroll para zoom • Hover para detalhes</span>
        </div>
      </div>
    </div>
  );
};

export default MapasTab;
