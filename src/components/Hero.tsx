import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { TabType } from "./Header";

interface HeroProps {
  onNavigate: (tab: TabType) => void;
}

const Hero = ({ onNavigate }: HeroProps) => {
  return (
    <section className="bg-hero py-20 md:py-32">
      <div className="container text-center">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-4">
          Normas de{" "}
          <span className="text-primary relative inline-block">
            Licitações
            <span className="absolute -bottom-2 left-0 right-0 h-1 bg-primary/30 rounded-full"></span>
          </span>
          {" "}e Contratos
          <br />
          <span className="text-muted-foreground text-2xl md:text-3xl lg:text-4xl font-medium mt-2 block">
            do Estado de São Paulo
          </span>
        </h1>
        
        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Consulte decretos, resoluções e portarias sobre contratações públicas. 
          Acesse relatórios analíticos, consultas inteligentes e mapas normativos.
        </p>

        <div className="mt-10 flex items-center justify-center">
          <Button 
            size="lg" 
            className="gap-2 px-8 text-base"
            onClick={() => onNavigate("normas")}
          >
            Consultar Normas
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Hero;
