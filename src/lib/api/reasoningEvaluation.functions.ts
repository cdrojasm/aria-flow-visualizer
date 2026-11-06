import { apiFetch } from "./client";

// LLM-judge verdicts on finished alerts (backend D6). Reading needs `monitor`;
// asking for an evaluation now needs `configuration` (it costs an LLM call).
// The evaluator is its own flow: an alert is resolved and visible whether or not
// its evaluation ever runs.

export type ReasoningEvaluationState =
  "evaluated" | "invalid" | "queued" | "running" | "failed" | "not_sampled" | "not_applicable";

export type ApiStepVerdict = {
  step: string;
  hallucination: boolean;
  data_use_correct: boolean;
  note: string;
};

export type ApiCriterionVerdict = {
  key: string;
  label: string;
  // null: the judge could not decide it (e.g. no model output to compare).
  passed: boolean | null;
  note: string;
};

export type ApiEvaluationJob = {
  status: "queued" | "running" | "evaluated" | "invalid" | "failed";
  requested_by: string;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
  error_code: string | null;
  // Waiting for the worker, judging, and the whole way from queued to verdict (ms).
  wait_ms: number | null;
  run_ms: number;
  total_ms: number | null;
};

export type ApiReasoningEvaluation = {
  alert_id: string;
  status: "evaluated" | "invalid";
  hallucination: boolean | null;
  data_use_correct: boolean | null;
  rationale: string;
  judge_model: string;
  prompt_version: string;
  attempts: number;
  input_tokens: number;
  output_tokens: number;
  evaluated_at: string;
  duration_ms: number;
  steps: ApiStepVerdict[];
  criteria: ApiCriterionVerdict[];
};

export type ApiAlertReasoningEvaluation = {
  alert_id: string;
  state: ReasoningEvaluationState;
  evaluation: ApiReasoningEvaluation | null;
  job: ApiEvaluationJob | null;
};

export function getAlertReasoningEvaluation(alertId: string) {
  return apiFetch<ApiAlertReasoningEvaluation>(
    `/api/v0/alerts/${encodeURIComponent(alertId)}/reasoning-evaluation`,
  );
}

/** Evaluate this alert now, whatever the sample rate (202: the worker does it). */
export function requestAlertReasoningEvaluation(alertId: string) {
  return apiFetch<ApiAlertReasoningEvaluation>(
    `/api/v0/alerts/${encodeURIComponent(alertId)}/reasoning-evaluation`,
    { method: "POST" },
  );
}

export type ApiCriterion = {
  key: string;
  label: string;
  question: string;
  scope: "step" | "alert";
  optional: boolean;
  counts_in_rollups: boolean;
};

export function listReasoningEvaluationCriteria() {
  return apiFetch<ApiCriterion[]>("/api/v0/metrics/reasoning-evaluation-criteria");
}

export type ReasoningEvaluationFilters = {
  fromDay: string;
  toDay: string;
  hallucination?: boolean;
  dataUseCorrect?: boolean;
  status?: "evaluated" | "invalid";
};

export function listReasoningEvaluations(filters: ReasoningEvaluationFilters) {
  const params = new URLSearchParams({
    from_day: filters.fromDay,
    to_day: filters.toDay,
    limit: "100",
  });
  if (filters.hallucination !== undefined) {
    params.set("hallucination", String(filters.hallucination));
  }
  if (filters.dataUseCorrect !== undefined) {
    params.set("data_use_correct", String(filters.dataUseCorrect));
  }
  if (filters.status) params.set("status", filters.status);
  return apiFetch<ApiReasoningEvaluation[]>(`/api/v0/metrics/reasoning-evaluations?${params}`);
}

export const STATE_LABELS: Record<ReasoningEvaluationState, string> = {
  evaluated: "Evaluada",
  invalid: "Evaluación inválida",
  queued: "En cola de evaluación",
  running: "Evaluando…",
  failed: "La evaluación falló",
  not_sampled: "Sin evaluación",
  not_applicable: "No aplica",
};

export const STATE_EXPLANATIONS: Record<ReasoningEvaluationState, string> = {
  evaluated: "",
  invalid: "El evaluador no devolvió una respuesta interpretable, ni tras reintentar.",
  queued:
    "El evaluador tiene esta alerta en su cola. No afecta a la alerta: ya está resuelta y visible.",
  running: "El evaluador está juzgando esta alerta ahora mismo.",
  failed:
    "El evaluador no pudo juzgar esta alerta (proveedor caído o sin pasos que juzgar). La alerta no se ve afectada; puedes volver a pedir la evaluación.",
  not_sampled:
    "El evaluador solo revisa una muestra aleatoria de las alertas y esta no fue elegida (o es anterior al evaluador). Puedes pedir su evaluación.",
  not_applicable: "Las pruebas y las evaluaciones del optimizador no pasan por el evaluador.",
};

/** "850 ms" / "1,2 s" / "2 min 5 s": how long something took, for people. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes} min ${Math.round((ms % 60_000) / 1000)} s`;
}
