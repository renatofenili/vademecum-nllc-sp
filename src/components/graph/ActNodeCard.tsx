import { FileText, Scale, Gavel, ScrollText, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActNode } from "./types";

interface ActNodeCardProps {
  node: ActNode;
  isSelected: boolean;
  isRoot: boolean;
  onClick: () => void;
}

const tipoIcons: Record<string, typeof FileText> = {
  constituicao: Scale,
  lei: Gavel,
  decreto: ScrollText,
  resolucao: FileCheck,
  portaria: FileText,
  instrucao_normativa: FileText,
};

const tipoColors: Record<string, string> = {
  constituicao: "bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-300",
  lei: "bg-blue-500/20 border-blue-500/50 text-blue-700 dark:text-blue-300",
  decreto: "bg-emerald-500/20 border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
  resolucao: "bg-purple-500/20 border-purple-500/50 text-purple-700 dark:text-purple-300",
  portaria: "bg-orange-500/20 border-orange-500/50 text-orange-700 dark:text-orange-300",
  instrucao_normativa: "bg-pink-500/20 border-pink-500/50 text-pink-700 dark:text-pink-300",
};

const formatTipo = (tipo: string) => {
  const tipos: Record<string, string> = {
    constituicao: "CF",
    decreto: "Decreto",
    resolucao: "Resolução",
    portaria: "Portaria",
    lei: "Lei",
    instrucao_normativa: "IN",
  };
  return tipos[tipo] || tipo;
};

export const ActNodeCard = ({ node, isSelected, isRoot, onClick }: ActNodeCardProps) => {
  const Icon = tipoIcons[node.tipo] || FileText;
  const colorClass = tipoColors[node.tipo] || "bg-muted border-border text-foreground";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-left",
        "hover:scale-105 hover:shadow-md",
        colorClass,
        isSelected && "ring-2 ring-primary ring-offset-2",
        isRoot && "ring-2 ring-amber-400"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">
          {formatTipo(node.tipo)} {node.numero}
        </div>
        {isRoot && (
          <div className="text-xs opacity-70">Raiz</div>
        )}
      </div>
    </button>
  );
};
