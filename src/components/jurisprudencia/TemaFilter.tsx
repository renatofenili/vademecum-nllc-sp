import { useEffect, useMemo, useState } from "react";
import { Compass, Search, Sparkles, Tag, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SmartTheme, ThemeCategory } from "./theme-intelligence";

interface TemaFilterProps {
  temas: SmartTheme[];
  featuredTemas: SmartTheme[];
  categories: ThemeCategory[];
  selectedTemas: string[];
  /** Themes present in the current search results — used to highlight matching pills */
  activeSearchThemes?: Set<string>;
  onToggleTema: (tema: string) => void;
  onClearAll: () => void;
}

const INITIAL_TEMAS_VISIBLE = 12;

const TemaFilter = ({ temas, featuredTemas, categories, selectedTemas, activeSearchThemes, onToggleTema, onClearAll }: TemaFilterProps) => {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id ?? "");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!categories.some((category) => category.id === activeCategory)) {
      setActiveCategory(categories[0]?.id ?? "");
    }
  }, [activeCategory, categories]);

  useEffect(() => {
    setExpanded(query.trim().length > 0);
  }, [query]);

  const normalizedQuery = query.trim().toLowerCase();

  const activeThemes = useMemo(() => {
    if (normalizedQuery) {
      return temas.filter((tema) =>
        [tema.label, ...tema.aliases].some((value) => value.toLowerCase().includes(normalizedQuery))
      );
    }

    return categories.find((category) => category.id === activeCategory)?.themes ?? [];
  }, [activeCategory, categories, normalizedQuery, temas]);

  const visibleThemes = expanded ? activeThemes : activeThemes.slice(0, INITIAL_TEMAS_VISIBLE);
  const hiddenCount = Math.max(0, activeThemes.length - visibleThemes.length);
  const activeCategoryLabel = categories.find((category) => category.id === activeCategory)?.label;

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-primary/15 bg-gradient-to-br from-primary/[0.03] via-background to-accent/[0.04] shadow-sm">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.06] via-transparent to-primary/[0.03]" />
      <div className="relative space-y-5 p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <Compass className="h-3.5 w-3.5" />
              Navegação temática
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground md:text-xl">
                Menu inteligente! Navegue pelos temas, de forma simples.
              </h2>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                O menu prioriza trilhas recorrentes, agrupa variações equivalentes e deixa a busca livre para casos mais específicos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] px-4 py-3 text-right shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Temas navegáveis
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {activeSearchThemes && activeSearchThemes.size > 0
                  ? activeSearchThemes.size
                  : categories.reduce((sum, category) => sum + category.count, 0)}
              </p>
            </div>
            {selectedTemas.length > 0 && (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={onClearAll}>
                Limpar seleção ({selectedTemas.length})
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-primary/12 bg-gradient-to-br from-primary/[0.04] to-background p-4 shadow-sm backdrop-blur">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary/70">
              <Sparkles className="h-3.5 w-3.5" />
              Destaques mais úteis
            </div>
            <div className="flex flex-wrap gap-2">
              {featuredTemas.map(({ label, count }) => {
                const isSelected = selectedTemas.includes(label);
                const isHighlighted = activeSearchThemes && activeSearchThemes.size > 0 && activeSearchThemes.has(label);
                const isDimmed = activeSearchThemes && activeSearchThemes.size > 0 && !activeSearchThemes.has(label);
                return (
                  <button
                    key={label}
                    onClick={() => onToggleTema(label)}
                    className={cn(
                      "group inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-medium transition-all duration-200",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : isHighlighted
                        ? "border-primary/50 bg-primary/10 text-foreground ring-2 ring-primary/20 shadow-sm"
                        : "border-border/70 bg-muted/40 text-foreground hover:border-primary/40 hover:bg-muted",
                      isDimmed && !isSelected && "opacity-40"
                    )}
                  >
                    <span>{label}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                        isSelected ? "bg-primary-foreground/15 text-primary-foreground" : "bg-background text-muted-foreground"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-primary/12 bg-gradient-to-br from-accent/[0.03] to-background p-4 shadow-sm backdrop-blur">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary/70">
              <Search className="h-3.5 w-3.5" />
              Buscar tema específico
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ex: pregão, habilitação, contrato..."
                className="h-11 rounded-2xl border-primary/15 bg-primary/[0.03] pl-10 focus:border-primary/30"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {normalizedQuery ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs leading-relaxed text-primary/70">
                <Tag className="h-3 w-3" />
                {activeThemes.length === 0
                  ? "Nenhum tema encontrado. Tente outra palavra."
                  : `${activeThemes.length} tema${activeThemes.length > 1 ? "s" : ""} encontrado${activeThemes.length > 1 ? "s" : ""} — clique para filtrar as decisões.`}
              </p>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Digite parte do assunto e clique no tema desejado para filtrar.
              </p>
            )}
          </div>
        </div>

        {selectedTemas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            {selectedTemas.map((tema) => (
              <Badge
                key={tema}
                variant="secondary"
                className="cursor-pointer gap-1 rounded-full px-3 py-1 text-xs font-medium hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onToggleTema(tema)}
              >
                {tema}
                <X className="h-3 w-3" />
              </Badge>
            ))}
          </div>
        )}

        {!normalizedQuery && categories.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => {
              const isActive = category.id === activeCategory;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category.id);
                    setExpanded(false);
                  }}
                  className={cn(
                    "rounded-3xl border p-4 text-left transition-all duration-200",
                    isActive
                      ? "border-primary/30 bg-primary/[0.08] shadow-sm shadow-primary/5"
                      : "border-primary/10 bg-primary/[0.02] hover:border-primary/20 hover:bg-primary/[0.05]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{category.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{category.description}</p>
                    </div>
                    <div className="rounded-2xl bg-primary/[0.06] px-2.5 py-1 text-right shadow-sm">
                      <div className="text-sm font-semibold text-foreground">{category.count}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">temas</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="rounded-3xl border border-primary/12 bg-gradient-to-b from-primary/[0.02] to-background p-4 shadow-sm backdrop-blur">
          <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {normalizedQuery ? "Resultado da busca temática" : activeCategoryLabel ? `Coleção: ${activeCategoryLabel}` : "Coleção temática"}
              </p>
              <p className="text-sm text-muted-foreground">
                {activeThemes.length === 0
                  ? "Nenhum tema encontrado para este filtro."
                  : `${activeThemes.length} tema${activeThemes.length > 1 ? "s" : ""} disponível${activeThemes.length > 1 ? "eis" : ""} nesta visão.`}
              </p>
            </div>
          </div>

          {activeThemes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              Tente outra palavra-chave ou selecione uma coleção temática.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {visibleThemes.map(({ label, count }) => {
                  const isSelected = selectedTemas.includes(label);
                  const isHighlighted = activeSearchThemes && activeSearchThemes.size > 0 && activeSearchThemes.has(label);
                  const isDimmed = activeSearchThemes && activeSearchThemes.size > 0 && !activeSearchThemes.has(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onToggleTema(label)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-200",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : isHighlighted
                          ? "border-primary/50 bg-primary/10 text-foreground ring-2 ring-primary/20 shadow-sm"
                          : "border-border/70 bg-background text-foreground hover:border-primary/40 hover:bg-muted/40",
                        isDimmed && !isSelected && "opacity-40"
                      )}
                    >
                      <span>{label}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                          isSelected ? "bg-primary-foreground/15 text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {hiddenCount > 0 && (
                <div className="mt-4">
                  <Button variant="ghost" size="sm" className="rounded-xl px-0 text-sm" onClick={() => setExpanded(true)}>
                    Mostrar mais {hiddenCount} tema{hiddenCount > 1 ? "s" : ""}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default TemaFilter;
