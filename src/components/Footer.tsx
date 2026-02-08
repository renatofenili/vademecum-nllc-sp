import { FileText } from "lucide-react";
import { TabType } from "./Header";

interface FooterProps {
  onTabChange?: (tab: TabType) => void;
}

const Footer = ({ onTabChange }: FooterProps) => {
  const navItems: { label: string; tab: TabType }[] = [
    { label: "Início", tab: "home" },
    { label: "Normas", tab: "normas" },
    { label: "Relatórios", tab: "relatorios" },
    { label: "Consultas", tab: "consultas" },
    { label: "Mapa Relacional", tab: "mapas" },
    { label: "Mapa de Calor", tab: "mapacalor" },
  ];

  return (
    <footer className="border-t border-border bg-card py-12">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-semibold text-foreground">Vade-Mécum SGGD SP</span>
              <p className="text-sm text-muted-foreground">
                Secretaria de Gestão e Governo Digital
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-6">
            {navItems.map((item) => (
              <button
                key={item.tab}
                onClick={() => onTabChange?.(item.tab)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-8 pt-8 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Governo do Estado de São Paulo. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
