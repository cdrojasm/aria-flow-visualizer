// Spanish labels for the backend's LLM elements (domain/llm/catalog.py).
export const LLM_ELEMENT_LABELS: Record<string, { label: string; hint: string }> = {
  profiling: { label: "Perfilamiento", hint: "Describe al usuario y la transacción." },
  detector: { label: "Detector", hint: "Primera evaluación de fraude." },
  detector_adversarial: {
    label: "Adversarial del detector",
    hint: "Contradice al detector antes de seguir.",
  },
  classification: { label: "Clasificación", hint: "Clasifica el tipo de fraude." },
  adversarial: { label: "Adversarial", hint: "Revisa y cuestiona la clasificación." },
  analyst: { label: "Analista", hint: "Decide la resolución de la alerta." },
  executor: { label: "Ejecutor", hint: "Textos de marcación ARIC y documentación." },
  report: { label: "Informe de auditoría", hint: "Informe de la decisión del analista." },
  judge: { label: "Juez de razonamiento", hint: "Evalúa el razonamiento del agente." },
  history_research: {
    label: "Investigación de historial",
    hint: "Planificador de la investigación delegada.",
  },
  assistant_chat: { label: "Asistente (chat)", hint: "Respuestas del asistente ARIA." },
  optimizer: { label: "Optimizador", hint: "Especialistas del agente orquestador." },
  agent_drafts: {
    label: "Borradores del agente",
    hint: "Borradores de taxonomías, flags, casos, listas y modus operandi.",
  },
};

export function llmElementLabel(element: string): string {
  return LLM_ELEMENT_LABELS[element]?.label ?? element;
}
