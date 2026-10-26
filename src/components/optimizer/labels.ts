import type { AgentEvent, AgentVerdictState } from "@/lib/api/agent.functions";

export const SPECIALIST_LABEL: Record<string, string> = {
  configuration: "Configuración",
  library: "Biblioteca",
  vector_store: "Vector store",
  xgboost: "Modelo (XGBoost)",
};

export const AREA_LABEL: Record<string, string> = {
  library: "Biblioteca",
  configuration: "Configuración",
  vector_store: "Vector store",
  model: "Modelos",
};

export const EVENT_KIND_LABEL: Record<string, string> = {
  session: "Sesión",
  iteration: "Iteración",
  hypothesis: "Hipótesis",
  specialist: "Especialista",
  experiment: "Experimento",
  verification: "Verificación",
  decision: "Decisión",
  budget: "Presupuesto",
  recovery: "Recuperación",
  blocked: "Espera tu decisión",
  user_action: "Tu acción",
  production_change: "Cambio en producción",
};

export const EVENT_OUTCOME_LABEL: Record<AgentEvent["outcome"], string> = {
  STARTED: "Inició",
  SUCCEEDED: "Terminó bien",
  FAILED: "Falló",
  BLOCKED: "Esperando",
  INFO: "Información",
};

export type Tone = "ok" | "info" | "warn" | "bad" | "muted";

export const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-success/10 text-success border-success/30",
  info: "bg-primary/5 text-primary border-primary/30",
  warn: "bg-warning/10 text-warning border-warning/30",
  bad: "bg-danger/10 text-danger border-danger/30",
  muted: "bg-surface text-text-secondary border-border",
};

export const VERDICT_META: Record<AgentVerdictState, { label: string; tone: Tone }> = {
  draft: { label: "Sin iniciar", tone: "muted" },
  running: { label: "Corriendo", tone: "info" },
  stalled: { label: "Sin respuesta del worker", tone: "warn" },
  failing: { label: "Una iteración falló", tone: "bad" },
  blocked: { label: "Esperando tu aprobación", tone: "warn" },
  paused: { label: "En pausa", tone: "muted" },
  completed: { label: "Terminada", tone: "ok" },
  inconclusive: { label: "Inconclusa", tone: "warn" },
  stopped: { label: "Detenida", tone: "muted" },
  failed: { label: "Falló", tone: "bad" },
  cancelled: { label: "Cancelada", tone: "muted" },
};

export const OUTCOME_TONE: Record<AgentEvent["outcome"], Tone> = {
  STARTED: "info",
  SUCCEEDED: "ok",
  FAILED: "bad",
  BLOCKED: "warn",
  INFO: "muted",
};

export function budgetLabel(resource: string, amount: number) {
  if (resource === "usd_micros") return `$${(amount / 1_000_000).toFixed(2)} USD`;
  if (resource === "seconds") return `${Math.ceil(amount / 60)} min`;
  return amount.toLocaleString("es-CO");
}

export const BUDGET_RESOURCE_LABEL: Record<string, string> = {
  tokens: "Tokens",
  usd_micros: "Costo",
  seconds: "Tiempo",
};

export function ageLabel(seconds: number | null | undefined) {
  if (seconds == null) return "sin eventos";
  if (seconds < 60) return `hace ${seconds} s`;
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  return `hace ${Math.floor(seconds / 3600)} h`;
}

/** Opaque ids are shown shortened: enough to compare, never meaningful on their own. */
export function shortRef(value: string) {
  return value.length > 8 ? value.slice(0, 8) : value;
}

export const REF_LABEL: Record<string, string> = {
  hypothesis_id: "hipótesis",
  experiment_id: "experimento",
  verification_id: "verificación",
  run_id: "ejecución",
  package_id: "paquete",
  release_id: "release",
  finding_id: "hallazgo",
  snapshot_id: "muestra",
  audit_correlation_id: "auditoría",
};

export const BLOCK_ERROR_COPY: Record<string, string> = {
  BUDGET_CEILING_EXCEEDED: "Supera el tope global de presupuesto de una sesión.",
  INVALID_BUDGET_GRANT: "Indica un monto mayor que cero.",
  INVALID_ALLOWANCE: "Elige entre 1 y 20 iteraciones.",
  INVALID_CONTEXT: "Escribe una pista de hasta 1.000 caracteres.",
  PERSONAL_DATA_BLOCKED: "El texto contiene datos personales; quítalos e inténtalo de nuevo.",
  GRANT_NOT_APPLICABLE: "Esa aprobación no corresponde al motivo de la espera.",
  SESSION_NOT_BLOCKED: "La sesión ya no está esperando una aprobación.",
  ROLE_NOT_ALLOWED: "Solo el Channel Manager puede aprobar.",
};

export const SESSION_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Ejecutando",
  PAUSED: "En pausa",
  WAITING_USER: "Esperando tu respuesta",
  WAITING_APPROVAL: "Requiere aprobación",
  COMPLETED: "Terminada",
  STOPPED: "Detenida",
  CANCELLED: "Cancelada",
  FAILED: "Fallida",
};

export const ITERATION_STATUS_LABEL: Record<string, string> = {
  RUNNING: "en curso",
  SUCCEEDED: "terminó bien",
  FAILED: "falló",
};
