import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const Hero = () => {
  return (
    <section className="bg-hero py-20 md:py-32">
      <div className="container text-center">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-4">
          Licitações e Contratos
          <br />
          <span className="text-primary">do Estado de São Paulo</span>
        </h1>
        
        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Consulte decretos, resoluções e portarias sobre contratações públicas do Estado de São Paulo.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" className="gap-2 px-8 text-base">
            Consultar Normas
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" className="px-8 text-base">
            Ver Trilhas
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Hero;
