import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  DollarSign,
  Scale,
  Calendar,
  Shield,
  Globe,
  Building2,
  Hash,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  X,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EditalAnalysis } from "./EditalAnalyzer";

interface Props {
  analysis: EditalAnalysis;
  onClose: () => void;
}

const slides = [
  { key: "intro" as const, label: "Apresentação", icon: FileText, color: "#3b82f6" },
  { key: "objeto" as const, label: "Objeto", icon: FileText, color: "#3b82f6" },
  { key: "valor_estimado" as const, label: "Valor Estimado", icon: DollarSign, color: "#10b981" },
  { key: "criterio_julgamento" as const, label: "Critério de Julgamento", icon: Scale, color: "#f59e0b" },
  { key: "data_sessao" as const, label: "Data da Sessão", icon: Calendar, color: "#8b5cf6" },
  { key: "condicoes_habilitacao" as const, label: "Habilitação", icon: Shield, color: "#ef4444" },
  { key: "sistema_licitacao" as const, label: "Onde Licitar", icon: Globe, color: "#06b6d4" },
  { key: "resumo" as const, label: "Em Linguagem Simples", icon: FileText, color: "#6366f1" },
];

const EditalPresentationView = ({ analysis, onClose }: Props) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [animPhase, setAnimPhase] = useState<"enter" | "visible" | "exit">("enter");

  const totalSlides = slides.length;

  const goToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSlides) {
        if (index >= totalSlides) {
          setIsPlaying(false);
          onClose();
        }
        return;
      }
      setAnimPhase("exit");
      setTimeout(() => {
        setCurrentSlide(index);
        setAnimPhase("enter");
        setTimeout(() => setAnimPhase("visible"), 50);
      }, 400);
    },
    [totalSlides, onClose]
  );

  // Auto-play
  useEffect(() => {
    if (!isPlaying) return;
    const duration = currentSlide === 0 ? 3500 : currentSlide === totalSlides - 1 ? 8000 : 5000;
    const timer = setTimeout(() => goToSlide(currentSlide + 1), duration);
    return () => clearTimeout(timer);
  }, [currentSlide, isPlaying, goToSlide, totalSlides]);

  // Kick-start enter animation
  useEffect(() => {
    const t = setTimeout(() => setAnimPhase("visible"), 50);
    return () => clearTimeout(t);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goToSlide(currentSlide + 1);
      }
      if (e.key === "ArrowLeft") goToSlide(currentSlide - 1);
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentSlide, goToSlide, onClose]);

  const slide = slides[currentSlide];
  const Icon = slide.icon;

  const getContent = () => {
    if (slide.key === "intro") {
      return {
        title: analysis.numero_edital || "Edital",
        subtitle: analysis.orgao || "",
        body: analysis.modalidade || "",
      };
    }
    if (slide.key === "resumo") {
      return {
        title: "Em Linguagem Simples",
        subtitle: "",
        body: analysis.resumo_simples || "",
      };
    }
    const value = analysis[slide.key as keyof EditalAnalysis] || "Não identificado no edital";
    return {
      title: slide.label,
      subtitle: "",
      body: typeof value === "string" ? value : "",
    };
  };

  const content = getContent();

  const animClass =
    animPhase === "enter"
      ? "opacity-0 translate-y-8 scale-95"
      : animPhase === "exit"
      ? "opacity-0 -translate-y-8 scale-95"
      : "opacity-100 translate-y-0 scale-100";

  // Progress bar
  const progress = ((currentSlide + 1) / totalSlides) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-slate-700/50 z-10">
        <div
          className="h-full transition-all duration-700 ease-out rounded-r"
          style={{ width: `${progress}%`, backgroundColor: slide.color }}
        />
      </div>

      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-10 text-white/60 hover:text-white hover:bg-white/10"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </Button>

      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center px-8 md:px-16 py-16">
        <div
          className={`max-w-3xl w-full transition-all duration-500 ease-out ${animClass}`}
        >
          {/* Icon */}
          <div
            className="mb-8 flex items-center justify-center"
          >
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl transition-colors duration-700"
              style={{ backgroundColor: `${slide.color}20` }}
            >
              <Icon
                className="h-10 w-10 transition-colors duration-700"
                style={{ color: slide.color }}
              />
            </div>
          </div>

          {/* Title */}
          {slide.key === "intro" ? (
            <div className="text-center space-y-4">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-400">
                Análise em Linguagem Simples
              </p>
              <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
                {content.title}
              </h1>
              {content.subtitle && (
                <p className="text-xl text-slate-300">{content.subtitle}</p>
              )}
              {content.body && (
                <div
                  className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full text-sm font-medium"
                  style={{ backgroundColor: `${slide.color}20`, color: slide.color }}
                >
                  <Scale className="h-4 w-4" />
                  {content.body}
                </div>
              )}
              <div className="flex items-center justify-center gap-2 mt-8 text-slate-500 text-sm">
                <ChevronRight className="h-4 w-4 animate-pulse" />
                <span>Pressione espaço ou clique em avançar</span>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <p
                  className="text-sm font-semibold uppercase tracking-[0.2em] mb-3 transition-colors duration-700"
                  style={{ color: slide.color }}
                >
                  {content.title}
                </p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
                <p className="text-lg md:text-xl text-slate-200 leading-relaxed whitespace-pre-line">
                  {content.body}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-8 py-4">
        {/* Slide indicators */}
        <div className="flex items-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.key}
              onClick={() => goToSlide(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentSlide ? "w-8" : "w-2 hover:w-4"
              }`}
              style={{
                backgroundColor:
                  i === currentSlide ? slide.color : "rgba(255,255,255,0.2)",
              }}
            />
          ))}
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => goToSlide(currentSlide - 1)}
            disabled={currentSlide === 0}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => goToSlide(currentSlide + 1)}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          <span className="text-sm text-slate-500 ml-2">
            {currentSlide + 1} / {totalSlides}
          </span>
        </div>
      </div>
    </div>
  );
};

export default EditalPresentationView;
