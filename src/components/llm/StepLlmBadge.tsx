// The deployment a workflow step actually ran with. The backend stores it as
// `llm` beside the step output ({element, name, deployment, source}).
export type StepLlm = {
  element?: string;
  name: string | null;
  deployment: string;
  source: "override" | "configuration" | "default";
};

const SOURCE_LABEL: Record<StepLlm["source"], string> = {
  override: "elegido en la prueba",
  configuration: "elegido en la configuración",
  default: "por defecto",
};

export function stepLlmFrom(output: unknown): StepLlm | null {
  if (!output || typeof output !== "object") return null;
  const llm = (output as { llm?: unknown }).llm;
  if (!llm || typeof llm !== "object") return null;
  const candidate = llm as Partial<StepLlm>;
  return typeof candidate.deployment === "string" ? (candidate as StepLlm) : null;
}

export function StepLlmBadge({ output }: { output: unknown }) {
  const llm = stepLlmFrom(output);
  if (!llm) return null;
  return (
    <span
      data-testid="step-llm"
      title={`${llm.deployment || "sin deployment"} · ${SOURCE_LABEL[llm.source] ?? llm.source}`}
      className="text-[11px] text-text-secondary"
    >
      Modelo <b className="text-text-primary">{llm.name ?? (llm.deployment || "por defecto")}</b>
      {llm.name && llm.deployment ? ` (${llm.deployment})` : ""}
    </span>
  );
}
