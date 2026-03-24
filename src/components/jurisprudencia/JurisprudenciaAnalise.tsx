import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { TrendingUp, Flame, BarChart3, Scale } from "lucide-react";
import { buildThemeIntelligence } from "./theme-intelligence";

interface Jurisprudencia {
  id: string;
  numero_tc: string;
  temas: string[];
  materia: string | null;
  objeto: string | null;
  resumo: string | null;
  sessao_data: string | null;
  boletim_referencia: string | null;
  link_relatorio_voto: string | null;
}

interface Props {
  dados: Jurisprudencia[];
  loading: boolean;
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

const HOT_COLORS = [
  "hsl(0, 85%, 50%)",
  "hsl(15, 90%, 52%)",
  "hsl(30, 95%, 50%)",
  "hsl(45, 90%, 48%)",
  "hsl(55, 85%, 45%)",
  "hsl(35, 80%, 55%)",
  "hsl(20, 75%, 58%)",
  "hsl(10, 70%, 60%)",
  "hsl(0, 65%, 62%)",
  "hsl(350, 60%, 55%)",
];

const PIE_COLORS = [
  "hsl(0, 72%, 42%)",
  "hsl(220, 70%, 50%)",
  "hsl(150, 60%, 40%)",
  "hsl(45, 85%, 48%)",
  "hsl(280, 60%, 50%)",
  "hsl(180, 55%, 42%)",
  "hsl(340, 65%, 48%)",
  "hsl(100, 50%, 40%)",
];

const JurisprudenciaAnalise = ({ dados, loading }: Props) => {
  const themeIntelligence = useMemo(() => buildThemeIntelligence(dados), [dados]);

  // 1) Decisions per month since 2024
  const monthlyData = useMemo(() => {
    const counts = new Map<string, number>();

    dados.forEach((item) => {
      if (!item.sessao_data) return;
      const [year, month] = item.sessao_data.split("-");
      if (parseInt(year) < 2024) return; // include 2024 and beyond
      const key = `${year}-${month}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => {
        const [year, month] = key.split("-");
        return {
          key,
          label: `${MONTH_LABELS[month]}/${year.slice(2)}`,
          count,
        };
      });
  }, [dados]);

  // 2) Top themes for thematic analysis
  const topThemes = useMemo(() => {
    return themeIntelligence.navigableThemes.slice(0, 12);
  }, [themeIntelligence.navigableThemes]);

  // 3) Hot topics (top 10 by count with heat scoring)
  const hotTopics = useMemo(() => {
    return themeIntelligence.navigableThemes.slice(0, 10).map((theme, i) => ({
      ...theme,
      heat: Math.round(100 * (1 - i / 10)),
      color: HOT_COLORS[i],
    }));
  }, [themeIntelligence.navigableThemes]);

  // Pie data for category breakdown
  const categoryData = useMemo(() => {
    return themeIntelligence.categories
      .filter((c) => c.decisionCount > 0)
      .map((c, i) => ({
        name: c.label,
        value: c.decisionCount,
        color: PIE_COLORS[i % PIE_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [themeIntelligence.categories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const totalDecisions = dados.length;
  const since2024 = dados.filter((d) => d.sessao_data && d.sessao_data >= "2024-01-01").length;

  return (
    <div className="space-y-8">
      {/* Stats overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total de Decisões", value: totalDecisions, icon: Scale },
          { label: "Desde 2024", value: since2024, icon: BarChart3 },
          { label: "Temas Identificados", value: themeIntelligence.navigableThemes.length, icon: TrendingUp },
          { label: "Categorias", value: themeIntelligence.categories.length, icon: Flame },
        ].map((stat) => (
          <Card key={stat.label} className="rounded-xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 1) Monthly decisions chart */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Decisões por Mês
          </CardTitle>
          <CardDescription>Volume de decisões publicadas desde 2024</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  fontSize={12}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  fontSize={12}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                  labelFormatter={(label) => `Período: ${label}`}
                  formatter={(value: number) => [`${value} decisões`, "Quantidade"]}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {monthlyData.map((_, index) => (
                    <Cell key={index} fill="hsl(var(--primary))" fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 2) Thematic analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Análise por Temática Dominante
            </CardTitle>
            <CardDescription>
              Principais assuntos com maior volume de decisões do TCE/SP
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topThemes.map((theme, idx) => {
              const maxCount = topThemes[0]?.count ?? 1;
              const pct = Math.round((theme.count / maxCount) * 100);
              return (
                <div key={theme.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground truncate mr-2">
                      {idx + 1}. {theme.label}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {theme.recordIds.length} decisões
                    </span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${pct}%`, opacity: 0.6 + (pct / 250) }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Category breakdown pie */}
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Distribuição por Categoria
            </CardTitle>
            <CardDescription>
              Participação de cada área temática no acervo jurisprudencial
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={110}
                    dataKey="value"
                    paddingAngle={2}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                    fontSize={11}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                    formatter={(value: number) => [`${value} decisões`, "Quantidade"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* 3) HOT TOPICS - Premium visualization */}
      <Card className="rounded-xl border-2 border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Flame className="h-8 w-8 text-primary animate-pulse" />
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
            </div>
            <div>
              <CardTitle className="text-xl">
                Temas Mais Quentes 🔥
              </CardTitle>
              <CardDescription>
                Os assuntos com maior incidência nas decisões recentes do TCE/SP
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {hotTopics.map((topic, idx) => (
              <div
                key={topic.key}
                className="relative group rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 transition-all duration-300 hover:shadow-lg hover:scale-[1.02] hover:border-primary/30"
              >
                {/* Heat indicator bar */}
                <div className="absolute top-0 left-0 h-1 rounded-t-xl transition-all duration-500"
                  style={{
                    width: `${topic.heat}%`,
                    background: `linear-gradient(90deg, ${topic.color}, ${HOT_COLORS[Math.min(idx + 1, HOT_COLORS.length - 1)]})`,
                  }}
                />

                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-2xl font-black"
                        style={{ color: topic.color }}
                      >
                        #{idx + 1}
                      </span>
                      {idx < 3 && (
                        <Badge
                          className="text-[10px] px-1.5 py-0 border-0 font-bold animate-pulse"
                          style={{
                            backgroundColor: topic.color,
                            color: "white",
                          }}
                        >
                          HOT
                        </Badge>
                      )}
                    </div>
                    <p className="font-semibold text-foreground text-sm leading-tight truncate">
                      {topic.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {topic.recordIds.length} decisões • {topic.count} menções
                    </p>
                  </div>

                  {/* Heat gauge */}
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center relative">
                      <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="hsl(var(--muted))"
                          strokeWidth="3"
                        />
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke={topic.color}
                          strokeWidth="3"
                          strokeDasharray={`${topic.heat}, 100`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute text-[10px] font-bold" style={{ color: topic.color }}>
                        {topic.heat}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default JurisprudenciaAnalise;
