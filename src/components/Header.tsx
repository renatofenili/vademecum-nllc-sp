import { Link } from "react-router-dom";
import { FileText, Route, CheckSquare, RefreshCw } from "lucide-react";

const navItems = [
  { label: "Normas", href: "#normas", icon: FileText },
  { label: "Trilhas", href: "#trilhas", icon: Route },
  { label: "Checklists", href: "#checklists", icon: CheckSquare },
  { label: "O que mudou", href: "#mudancas", icon: RefreshCw },
];

const Header = () => {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-primary">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold text-foreground">
            Vade-Mécum SGGD SP
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;
