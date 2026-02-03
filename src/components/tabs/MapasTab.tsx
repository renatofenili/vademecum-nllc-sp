import { useState, useEffect } from "react";
import { TreeDeciduous } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { HierarchicalMapView } from "@/components/graph/HierarchicalMapView";
import { ActsGraphData } from "@/components/graph/types";

const MapasTab = () => {
  const [actsData, setActsData] = useState<ActsGraphData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
            Hierarquia normativa a partir da Constituição Federal de 1988
          </p>
        </div>
      </div>

      {/* Map container */}
      <Card className="min-h-[600px] flex flex-col overflow-hidden">
        <CardContent className="flex-1 flex flex-col p-0">
          <HierarchicalMapView
            data={actsData}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Instructions */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-6 text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
          <span>🖱️ Clique para expandir • Hover para detalhes • Arraste para navegar</span>
        </div>
      </div>
    </div>
  );
};

export default MapasTab;
