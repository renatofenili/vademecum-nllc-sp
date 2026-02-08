import { FileText, FileBarChart, Search, Network, Flame, LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TabType } from "./Header";

interface Category {
  icon: LucideIcon;
  title: string;
  description: string;
  tab: TabType;
}

const categories: Category[] = [
  {
    icon: FileText,
    title: "Normas",
    description: "Acesse o texto completo das leis, decretos, resoluções e portarias que regulamentam as licitações no Estado de São Paulo.",
    tab: "normas",
  },
  {
    icon: FileBarChart,
    title: "Relatórios",
    description: "Relatórios pré-definidos e análises consolidadas sobre cadeias normativas, inexigibilidade e outros temas.",
    tab: "relatorios",
  },
  {
    icon: Search,
    title: "Busca por Dispositivo",
    description: "Pesquise por artigo, parágrafo ou inciso específico de qualquer norma cadastrada.",
    tab: "consultas",
  },
  {
    icon: Network,
    title: "Mapa Relacional",
    description: "Visualize grafos de dependências normativas, dispositivos centrais e caminhos entre normas.",
    tab: "mapas",
  },
  {
    icon: Flame,
    title: "Mapa de Calor",
    description: "Visualize a jornada da contratação pública com a intensidade normativa de cada etapa.",
    tab: "mapacalor",
  },
];

interface CategoriesProps {
  onNavigate: (tab: TabType) => void;
}

const Categories = ({ onNavigate }: CategoriesProps) => {
  return (
    <section id="categorias" className="py-16 md:py-24 bg-background">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Explore o Sistema
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Acesse as diferentes funcionalidades do Vade-Mécum Analítico
          </p>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {categories.map((category) => (
            <Card 
              key={category.title}
              className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/30"
              onClick={() => onNavigate(category.tab)}
            >
              <CardHeader className="pb-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <category.icon className="h-6 w-6" />
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="text-lg font-semibold text-foreground mb-2">{category.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{category.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Categories;
