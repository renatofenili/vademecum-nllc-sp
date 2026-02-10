import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { TabType } from "./Header";
import logoSGGD from "@/assets/logo-sggd.jpg";
import logoLaboratorio from "@/assets/logo-laboratorio.png";

interface HeroProps {
  onNavigate: (tab: TabType) => void;
}

const Hero = ({ onNavigate }: HeroProps) => {
  return (
    <section className="bg-hero py-16 md:py-24">
      <div className="container text-center">
        {/* Logo SGGD centralizado com destaque */}
        <div className="mb-8 flex items-center justify-center gap-6 md:gap-8">
          <img 
            src={logoSGGD} 
            alt="SGGD - Gestão e Governo Digital" 
            className="h-24 md:h-32 lg:h-40 w-auto object-contain rounded-lg shadow-lg"
          />
          <img 
            src={logoLaboratorio} 
            alt="Laboratório de Inovação em Logística Pública" 
            className="h-24 md:h-32 lg:h-40 w-auto object-contain"
          />
        </div>
        
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground mb-4">
          Normas de Licitações e Contratos
          <br />
          <span className="text-primary">do Estado de São Paulo</span>
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
