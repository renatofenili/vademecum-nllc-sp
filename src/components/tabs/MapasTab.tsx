import { useState, useEffect } from "react";
import { Network, Scale, Gavel } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ActsGraphView } from "@/components/graph/ActsGraphView";
import { DispositivosGraph } from "@/components/graph/DispositivosGraph";
import {
  GraphLevel,
  RootOption,
  ActsGraphData,
  DispositivosGraphData,
} from "@/components/graph/types";

const MapasTab = () => {
  const [rootOption, setRootOption] = useState<RootOption>("lei14133");
  const [graphLevel, setGraphLevel] = useState<GraphLevel>("ato");
  const [selectedActId, setSelectedActId] = useState<string | null>(null);

  const [actsData, setActsData] = useState<ActsGraphData | null>(null);
  const [dispositivosData, setDispositivosData] = useState<DispositivosGraphData | null>(null);
  const [isLoadingActs, setIsLoadingActs] = useState(false);
  const [isLoadingDispositivos, setIsLoadingDispositivos] = useState(false);

  // Load acts graph on mount and when root changes
  useEffect(() => {
    const loadActsGraph = async () => {
      setIsLoadingActs(true);
      try {
        const { data, error } = await supabase.functions.invoke("graph-acts", {
          body: { root: rootOption, depth: 2 },
        });

        if (error) throw error;
        setActsData(data);
      } catch (err) {
        console.error("Erro ao carregar grafo de atos:", err);
      } finally {
        setIsLoadingActs(false);
      }
    };

    loadActsGraph();
  }, [rootOption]);

  // Load dispositivos graph when drilling down
  const handleDrillDown = async (actId: string) => {
    // Skip drill-down for virtual root nodes
    if (actId === "cf88" || actId === "lei14133") {
      return;
    }

    setSelectedActId(actId);
    setGraphLevel("dispositivo");
    setIsLoadingDispositivos(true);

    try {
      const { data, error } = await supabase.functions.invoke("graph-dispositivos", {
        body: { act_id: actId },
      });

      if (error) throw error;
      setDispositivosData(data);
    } catch (err) {
      console.error("Erro ao carregar grafo de dispositivos:", err);
    } finally {
      setIsLoadingDispositivos(false);
    }
  };

  const handleBackToActs = () => {
    setGraphLevel("ato");
    setSelectedActId(null);
    setDispositivosData(null);
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-8 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Mapas Normativos
          </h1>
          <p className="text-muted-foreground text-lg">
            Visualize o grafo global de atos normativos e suas dependências
          </p>
        </div>
      </div>

      {/* Root selector */}
      <div className="flex justify-center gap-4">
        <Button
          variant={rootOption === "cf88" ? "default" : "outline"}
          onClick={() => setRootOption("cf88")}
          className="gap-2"
        >
          <Scale className="h-4 w-4" />
          CF/88
        </Button>
        <Button
          variant={rootOption === "lei14133" ? "default" : "outline"}
          onClick={() => setRootOption("lei14133")}
          className="gap-2"
        >
          <Gavel className="h-4 w-4" />
          Lei nº 14.133/2021
        </Button>
      </div>

      {/* Graph container */}
      <Card className="min-h-[600px] flex flex-col">
        <CardContent className="flex-1 flex flex-col p-0">
          {graphLevel === "ato" ? (
            <ActsGraphView
              data={actsData}
              isLoading={isLoadingActs}
              onDrillDown={handleDrillDown}
            />
          ) : (
            <DispositivosGraph
              data={dispositivosData}
              isLoading={isLoadingDispositivos}
              onBack={handleBackToActs}
            />
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      {graphLevel === "ato" && !isLoadingActs && actsData && (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-6 text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              <span>Clique em um ato para ver detalhes</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapasTab;
