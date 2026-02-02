import { FileText, Route, CheckSquare, RefreshCw } from "lucide-react";
import CategoryCard from "./CategoryCard";

const categories = [
  {
    icon: FileText,
    title: "Normas",
    description: "Acesse o texto completo das leis, decretos, resoluções e portarias que regulamentam as licitações no Estado de São Paulo.",
  },
  {
    icon: Route,
    title: "Trilhas",
    description: "Navegue por trilhas temáticas organizadas para facilitar o entendimento das normas por tipo de contratação.",
  },
  {
    icon: CheckSquare,
    title: "Checklists",
    description: "Utilize checklists práticos para garantir conformidade em cada etapa do processo licitatório.",
  },
  {
    icon: RefreshCw,
    title: "O que mudou",
    description: "Acompanhe as atualizações mais recentes na legislação de licitações e suas implicações práticas.",
  },
];

const Categories = () => {
  return (
    <section id="categorias" className="py-16 md:py-24 bg-background">
      <div className="container">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => (
            <CategoryCard
              key={category.title}
              icon={category.icon}
              title={category.title}
              description={category.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Categories;
