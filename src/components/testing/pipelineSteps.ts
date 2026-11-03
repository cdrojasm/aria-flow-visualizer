// Debe coincidir con LINEAR_STEPS de alert_review_workflow.py en el backend.
export const PIPELINE_STEP_ORDER = [
  "pre_process",
  "deterministic",
  "profiling",
  "detector",
  "detector_adversarial",
  "classification",
  "adversarial",
  "analyst",
  "executor",
  "post_process",
] as const;

export const PIPELINE_STEP_LABELS: Record<string, string> = {
  pre_process: "Pre-proceso",
  deterministic: "Determinístico",
  profiling: "Perfilador",
  detector: "Detector",
  detector_adversarial: "Detector adversarial",
  classification: "Clasificador",
  adversarial: "Adversarial",
  analyst: "Analista",
  executor: "Ejecutor",
  post_process: "Post-proceso",
};

// Nombre corto solo para el recorrido; el tooltip muestra el nombre completo.
export const PIPELINE_STEP_SHORT_LABELS: Record<string, string> = {
  detector_adversarial: "Detector adv.",
};

export const PIPELINE_STEP_DESCRIPTIONS: Record<string, string> = {
  pre_process:
    "Valida los campos obligatorios y trae el contexto: señales ARIC, perfil e historial.",
  deterministic:
    "Evalúa las reglas configuradas; si una aplica, descarta la alerta sin usar el LLM.",
  profiling: "Resume con el LLM el perfil del cliente y la transacción.",
  detector: "Primer filtro con LLM; si concluye que no es fraude, salta al ejecutor.",
  detector_adversarial: "Revisa la conclusión del detector y puede devolverla.",
  classification: "Decide con el LLM si es fraude, no fraude o no concluyente.",
  adversarial: "Revisa la clasificación y puede devolverla al clasificador.",
  analyst: "Propone la decisión final y el playbook a seguir.",
  executor: "Aplica la acción decidida sobre la alerta.",
  post_process: "Registra el resultado final del caso.",
};

export function isPipelineStep(name: string): boolean {
  return (PIPELINE_STEP_ORDER as readonly string[]).includes(name);
}

export function sortByPipelineOrder<T>(entries: [string, T][]): [string, T][] {
  const rank = (name: string) => {
    const index = PIPELINE_STEP_ORDER.indexOf(name as (typeof PIPELINE_STEP_ORDER)[number]);
    return index === -1 ? PIPELINE_STEP_ORDER.length : index;
  };
  return [...entries].sort(([a], [b]) => rank(a) - rank(b));
}
