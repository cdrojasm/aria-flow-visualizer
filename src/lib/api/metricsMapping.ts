import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import type {
  ApiAlertStatus,
  ApiFraudQualityStats,
  ApiMaturation,
  ApiMetricsWarning,
  ApiResolutionMethod,
  MetricsFilters,
  MetricsQuery,
} from "./metrics.functions";

// Client-side derivations over the metrics API's additive sums
// (metrics.functions.ts). The backend only returns numerators and
// denominators; every rate/average shown in the UI is computed here, once,
// from the summed values - never an average of averages.

export const NO_DATA = "sin datos";

/** numerator / denominator, or null when the denominator is 0. */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function formatPct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA;
  return `${(value * 100).toLocaleString("es-CO", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("es-CO");
}

export function formatAmount(value: number): string {
  return `$ ${value.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

/** Seconds as a short human duration ("840 ms", "12,4 s", "3,2 min", "1,5 h"). */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return NO_DATA;
  const one = (v: number) => v.toLocaleString("es-CO", { maximumFractionDigits: 1 });
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${one(seconds)} s`;
  if (seconds < 3600) return `${one(seconds / 60)} min`;
  return `${one(seconds / 3600)} h`;
}

export function averageSeconds(sumSeconds: number, count: number): number | null {
  return ratio(sumSeconds, count);
}

// --- Fraud quality ------------------------------------------------------------
// FP = mark fraud & fraud_label no_fraud; undetected fraud = mark no_fraud &
// fraud_label fraud. Both over `decided` (pending excluded by the backend).

export function falsePositiveRate(q: ApiFraudQualityStats): number | null {
  return ratio(q.false_positives, q.decided);
}

export function undetectedFraudRate(q: ApiFraudQualityStats): number | null {
  return ratio(q.undetected_fraud, q.decided);
}

// --- Maturation ------------------------------------------------------------

export const MATURATION_META: Record<
  ApiMaturation,
  { label: string; className: string; help: string }
> = {
  maturing: {
    label: "En maduración",
    className: "bg-warning/15 text-warning",
    help: "Incluye días de hace menos de 4 días: las correcciones de fraude aún están llegando (~98 % llega en 4 días).",
  },
  may_vary: {
    label: "Puede variar",
    className: "bg-primary/10 text-primary",
    help: "Incluye periodos de los últimos 6 meses: aún pueden llegar correcciones tardías (~2 %).",
  },
  stable: {
    label: "Estable",
    className: "bg-success/10 text-success",
    help: "Periodos de hace más de 6 meses: el resultado ya no cambia.",
  },
};

const MATURATION_ORDER: ApiMaturation[] = ["maturing", "may_vary", "stable"];

/** The least mature state among the periods read (null when there are none). */
export function worstMaturation(periods: { maturation: ApiMaturation }[]): ApiMaturation | null {
  if (periods.length === 0) return null;
  return MATURATION_ORDER.find((m) => periods.some((p) => p.maturation === m)) ?? null;
}

// --- Warnings ------------------------------------------------------------------
// The backend message is English and technical; the code is the contract.

const WARNING_TEXT: Record<ApiMetricsWarning["code"], string> = {
  partial_period:
    "Más de 90 días atrás los datos sólo se guardan por mes/año: estos periodos se cuentan completos e incluyen alertas fuera del rango pedido.",
  amount_tier_set_changed:
    "El rango cruza más de un juego de rangos de monto: cada alerta conserva el rango con el que se clasificó al llegar.",
  fraud_label_maturing:
    "Los falsos positivos y el fraude no detectado aún pueden cambiar en estos periodos: las correcciones llegan hasta ~6 meses después (~98 % en 4 días).",
};

export function warningText(warning: ApiMetricsWarning): string {
  return WARNING_TEXT[warning.code] ?? warning.message;
}

// --- Labels ------------------------------------------------------------------

export const STATUS_LABELS: Record<ApiAlertStatus, string> = {
  RECEIVED: "Recibida (en cola)",
  PROCESSING: "En proceso por ARIA",
  ESCALATED: "Escalada a analista",
  CLOSED: "Cerrada",
  SKIPPED: "Saltada",
  FAILED: "Fallida",
};

export const STATUS_COLORS: Record<string, string> = {
  RECEIVED: "#60a5fa",
  PROCESSING: "#fbbf24",
  ESCALATED: "#a78bfa",
  CLOSED: "#34d399",
  SKIPPED: "#9ca3af",
  FAILED: "#f87171",
  unknown: "#d1d5db",
};

export const RESOLUTION_METHOD_LABELS: Record<ApiResolutionMethod, string> = {
  aria: "ARIA",
  analyst: "Analista",
  voicebot: "Voicebot",
  bidi: "Bidi",
  unknown: "Sin método",
};

export function statusLabel(value: string): string {
  return STATUS_LABELS[value as ApiAlertStatus] ?? (value === "unknown" ? "Sin dato" : value);
}

export function resolutionMethodLabel(value: string | null): string {
  if (!value) return "—";
  return RESOLUTION_METHOD_LABELS[value as ApiResolutionMethod] ?? value;
}

// --- Range presets -------------------------------------------------------------

export const RANGE_PRESETS = ["Último día", "Semana", "Mes"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

const PRESET_HOURS: Record<RangePreset, number> = {
  "Último día": 24,
  Semana: 24 * 7,
  Mes: 24 * 30,
};

/** Rolling window ending now, as offset-aware ISO strings. */
export function presetRange(
  preset: RangePreset,
  now: Date = new Date(),
): { from: string; to: string } {
  const from = new Date(now.getTime() - PRESET_HOURS[preset] * 3_600_000);
  return { from: from.toISOString(), to: now.toISOString() };
}

/** Whole calendar days [from 00:00, day after `to` 00:00), without an offset
 * so the backend reads them in the operations timezone (America/Bogota). */
export function customDayRange(from: Date, to: Date): { from: string; to: string } {
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  return {
    from: `${format(from, "yyyy-MM-dd")}T00:00:00`,
    to: `${format(end, "yyyy-MM-dd")}T00:00:00`,
  };
}

// --- Filters -------------------------------------------------------------------

/** UI single-select per dimension ("" / undefined = all) -> wire filters. */
export type FilterSelection = Partial<Record<keyof MetricsFilters, string>>;

export function toMetricsFilters(selection: FilterSelection): MetricsFilters {
  const filters: MetricsFilters = {};
  for (const [name, value] of Object.entries(selection)) {
    if (value) filters[name as keyof MetricsFilters] = [value];
  }
  return filters;
}

export function toMetricsQuery(
  range: { from: string; to: string },
  selection: FilterSelection,
): MetricsQuery {
  return { ...range, filters: toMetricsFilters(selection) };
}

// --- Histogram buckets -----------------------------------------------------------
// Fixed bucket codes from the backend (alert_rollup_contribution.py /
// technical_rollup_contribution.py); unknown codes fall back to the
// upper bound.

const BUCKET_LABELS: Record<string, string> = {
  rt_lt_1m: "< 1 min",
  rt_1_5m: "1–5 min",
  rt_5_15m: "5–15 min",
  rt_15_30m: "15–30 min",
  rt_gt_30m: "> 30 min",
  mat_lt_1d: "< 1 día",
  mat_1_4d: "1–4 días",
  mat_4_30d: "4–30 días",
  mat_1_6mo: "1–6 meses",
  mat_gt_6mo: "> 6 meses",
};

export function bucketLabel(bucket: {
  bucket: string;
  upper_bound_seconds: number | null;
}): string {
  if (BUCKET_LABELS[bucket.bucket]) return BUCKET_LABELS[bucket.bucket];
  return bucket.upper_bound_seconds === null
    ? `> ${bucket.bucket}`
    : `< ${formatDuration(bucket.upper_bound_seconds)}`;
}

// --- Range state shared by the metrics pages ------------------------------------

export type RangeState = {
  preset: RangePreset | null;
  custom?: DateRange;
  from: string;
  to: string;
};

export function initialRange(preset: RangePreset = "Último día"): RangeState {
  return { preset, ...presetRange(preset) };
}

/** Presets (rolling window ending now) + calendar for whole days. */
