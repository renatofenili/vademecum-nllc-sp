import { useState, useMemo, useRef } from "react";
import { Check, ChevronsUpDown, Search, Tag, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TemaInfo {
  tema: string;
  count: number;
}

interface TemaFilterProps {
  temas: TemaInfo[];
  selectedTemas: string[];
  onToggleTema: (tema: string) => void;
  onClearAll: () => void;
}

const TOP_COUNT = 6;

const TemaFilter = ({ temas, selectedTemas, onToggleTema, onClearAll }: TemaFilterProps) => {
  const [open, setOpen] = useState(false);

  const topTemas = useMemo(() => temas.slice(0, TOP_COUNT), [temas]);
  const hasMore = temas.length > TOP_COUNT;

  return (
    <div className="space-y-3">
      {/* Row: top themes + popover trigger */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Top theme pills — always visible */}
        {topTemas.map(({ tema, count }) => {
          const isSelected = selectedTemas.includes(tema);
          return (
            <button
              key={tema}
              onClick={() => onToggleTema(tema)}
              className={cn(
                "group inline-flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
                isSelected
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "bg-card border border-border text-foreground/70 hover:border-primary/40 hover:text-foreground hover:shadow-sm"
              )}
            >
              <span className="truncate max-w-[160px]">{tema}</span>
              <span
                className={cn(
                  "tabular-nums text-[10px] leading-none rounded-md px-1.5 py-0.5 font-bold",
                  isSelected
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}

        {/* "More themes" popover trigger */}
        {hasMore && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "rounded-lg gap-1.5 text-xs h-8 border-dashed",
                  selectedTemas.some((t) => !topTemas.find((tt) => tt.tema === t))
                    ? "border-primary/50 text-primary"
                    : ""
                )}
              >
                <Search className="h-3 w-3" />
                {temas.length - TOP_COUNT} temas
                <ChevronsUpDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar tema..." className="h-9" />
                <CommandList>
                  <CommandEmpty>Nenhum tema encontrado.</CommandEmpty>
                  <CommandGroup>
                    {temas.map(({ tema, count }) => {
                      const isSelected = selectedTemas.includes(tema);
                      return (
                        <CommandItem
                          key={tema}
                          value={tema}
                          onSelect={() => onToggleTema(tema)}
                          className="flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                                isSelected
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-muted-foreground/30"
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3" />}
                            </div>
                            <span className="truncate text-sm">{tema}</span>
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {count}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Selected tags (from popover — not top pills) */}
      {selectedTemas.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
          {selectedTemas.map((tema) => (
            <Badge
              key={tema}
              variant="secondary"
              className="gap-1 cursor-pointer rounded-md px-2 py-0.5 text-xs hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={() => onToggleTema(tema)}
            >
              {tema}
              <X className="h-3 w-3" />
            </Badge>
          ))}
          <button
            onClick={onClearAll}
            className="text-[11px] text-muted-foreground hover:text-destructive ml-1 underline underline-offset-2"
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  );
};

export default TemaFilter;
