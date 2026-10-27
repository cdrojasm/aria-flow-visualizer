import type { ToolPickerFields } from "@/data/configs";

// Steps that carry the shared tool block, in the order the editor shows them.
const TOOL_STEPS = [
  ["detector", "Detector"],
  ["detectorAdversarial", "Adversarial (detector)"],
  ["classification", "Clasificación"],
  ["adversarial", "Adversarial (clasificador)"],
] as const;

type ToolStepKey = (typeof TOOL_STEPS)[number][0];

// The backend rejects (422) a Búsqueda en Vector Store that is enabled without
// an instance - block save up front and say which segment/step is missing it.
export function vectorStoreValidationErrors(
  segments: Record<string, { agent?: Partial<Record<ToolStepKey, ToolPickerFields | undefined>> }>,
): string[] {
  return Object.entries(segments).flatMap(([code, segment]) =>
    TOOL_STEPS.filter(([key]) => {
      const vectorStore = segment.agent?.[key]?.delegatedResearch?.vectorStore;
      return !!vectorStore?.enabled && !vectorStore.vectorStoreInstanceId;
    }).map(([, label]) => `${code} · ${label}`),
  );
}
