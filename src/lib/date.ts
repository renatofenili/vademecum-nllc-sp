import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Converte strings vindas do backend (geralmente `YYYY-MM-DD` ou ISO) para Date
 * sem o bug de fuso horário do `new Date('YYYY-MM-DD')` (que interpreta como UTC).
 */
export function parseBackendDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // date-fns parseISO interpreta "YYYY-MM-DD" como data local (não UTC), evitando -1 dia.
  const parsed = parseISO(trimmed);
  if (isValid(parsed)) return parsed;

  const fallback = new Date(trimmed);
  return isValid(fallback) ? fallback : null;
}

export function formatDateBR(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parseBackendDate(value);
  if (!d) return value;
  return format(d, "dd/MM/yyyy", { locale: ptBR });
}
