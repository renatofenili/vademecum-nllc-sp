import { Link } from "react-router-dom";
import { FileText, FileBarChart, Search, Network, Flame } from "lucide-react";
import logoSGGD from "@/assets/logo-sggd.jpg";

export type TabType = "home" | "normas" | "relatorios" | "consultas" | "mapas" | "mapacalor";

interface HeaderProps {
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
}

const navItems: { label: string; tab: TabType; icon: typeof FileText }[] = [
  { label: "Normas", tab: "normas", icon: FileText },
  { label: "Busca por Dispositivo", tab: "consultas", icon: Search },
  { label: "Mapa Relacional", tab: "mapas", icon: Network },
  { label: "Mapa de Calor", tab: "mapacalor", icon: Flame },
  { label: "Linguagem Simples!", tab: "relatorios", icon: FileBarChart },
];

const Header = ({ activeTab = "home", onTabChange }: HeaderProps) => {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-16 items-center justify-between">
        <button 
          onClick={() => onTabChange?.("home")}
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        >
          <img 
            src={logoSGGD} 
            alt="SGGD - Gestão e Governo Digital" 
            className="h-10 w-auto object-contain"
          />
          <span 
            className="text-sm font-semibold text-foreground flex flex-col leading-tight"
            style={{ 
              textShadow: '0 0 4px hsl(0 72% 50% / 0.4), 0 0 8px hsl(0 72% 50% / 0.2)' 
            }}
          >
            <span>Vade-Mécum em Licitações</span>
            <span className="text-xs">SGGD SP</span>
          </span>
        </button>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.tab}
              onClick={() => onTabChange?.(item.tab)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === item.tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Mobile Nav */}
      <nav className="md:hidden flex overflow-x-auto border-t border-border bg-card">
        {navItems.map((item) => (
          <button
            key={item.tab}
            onClick={() => onTabChange?.(item.tab)}
            className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors ${
              activeTab === item.tab
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground"
            }`}
          >
            <item.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
};

export default Header;
