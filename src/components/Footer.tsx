import { FileText } from "lucide-react";

const Footer = () => {
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
            <a href="#normas" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Normas
            </a>
            <a href="#trilhas" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Trilhas
            </a>
            <a href="#checklists" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Checklists
            </a>
            <a href="#mudancas" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              O que mudou
            </a>
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
