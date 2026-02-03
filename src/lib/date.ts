import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Converte strings vindas do backend (geralmente `YYYY-MM-DD` ou ISO) para Date
 * sem o bug de fuso horário do `new Date('YYYY-MM-DD')` (que interpreta como UTC).
 */
export function parseBackendDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Para datas sem horário (YYYY-MM-DD), NÃO use parseISO/new Date(string):
  // isso costuma virar meia-noite UTC e, em fusos negativos (ex.: Brasil), aparece -1 dia.
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);

    const local = new Date(year, month - 1, day);
    const isSameCalendarDate =
      local.getFullYear() === year &&
      local.getMonth() === month - 1 &&
      local.getDate() === day;

    return isSameCalendarDate ? local : null;
  }

  // Para ISO com horário/timezone, parseISO é ok.
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
