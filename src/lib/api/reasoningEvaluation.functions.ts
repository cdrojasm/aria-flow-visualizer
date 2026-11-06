import { apiFetch } from "./client";

// LLM-judge verdicts on finished alerts (backend D6). Permission `monitor`.

export type ReasoningEvaluationState =
  "evaluated" | "invalid" | "pending" | "not_sampled" | "not_applicable";

export type ApiStepVerdict = {
  step: string;
  hallucination: boolean;
  data_use_correct: boolean;
  note: string;
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
  steps: ApiStepVerdict[];
};

export type ApiAlertReasoningEvaluation = {
  alert_id: string;
  state: ReasoningEvaluationState;
  evaluation: ApiReasoningEvaluation | null;
};

export function getAlertReasoningEvaluation(alertId: string) {
  return apiFetch<ApiAlertReasoningEvaluation>(
    `/api/v0/alerts/${encodeURIComponent(alertId)}/reasoning-evaluation`,
  );
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
  pending: "Pendiente de evaluar",
  not_sampled: "No muestreada",
  not_applicable: "No aplica",
};

export const STATE_EXPLANATIONS: Record<ReasoningEvaluationState, string> = {
  evaluated: "",
  invalid: "El evaluador no devolvió una respuesta interpretable, ni tras reintentar.",
  pending:
    "Esta alerta fue elegida por el muestreo y aún no tiene veredicto (en cola, o el workflow no ha terminado).",
  not_sampled:
    "El evaluador solo revisa una muestra aleatoria de las alertas; esta no fue elegida.",
  not_applicable: "Las pruebas y las evaluaciones del optimizador no pasan por el evaluador.",
};
