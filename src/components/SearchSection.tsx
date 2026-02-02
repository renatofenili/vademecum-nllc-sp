import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SearchSection = () => {
  return (
    <section className="py-16 md:py-20 bg-hero border-y border-border">
      <div className="container">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            Busca Rápida
          </h2>
          <p className="text-muted-foreground">
            Encontre rapidamente a norma que você procura
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Digite o número ou assunto da norma..."
                className="pl-10 h-12 text-base"
              />
            </div>
            <Button size="lg" className="px-8">
              Buscar
            </Button>
          </div>
          
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <span className="text-sm text-muted-foreground">Sugestões:</span>
            {["Decreto 67.608", "Pregão Eletrônico", "Dispensa de Licitação", "Lei 14.133"].map((term) => (
              <button
                key={term}
                className="text-sm text-primary hover:underline underline-offset-2"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SearchSection;
