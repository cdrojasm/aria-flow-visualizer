// Display names of the alert-review workflow steps (backend step_name).
export const STEP_LABELS: Record<string, string> = {
  pre_process: "Pre-proceso",
  deterministic: "Reglas determinísticas",
  profiling: "Perfilamiento",
  detector: "Detector",
  detector_adversarial: "Adversarial (detector)",
  classification: "Clasificación",
  adversarial: "Adversarial",
  analyst: "Analista (agente)",
  executor: "Ejecutor",
  post_process: "Post-proceso",
};
