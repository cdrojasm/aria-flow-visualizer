import { useState } from "react";

import type { SegmentAgentConfig } from "@/data/configs";
import { SegmentAdversarialSection } from "./SegmentAdversarialSection";
import { SegmentAnalystSection } from "./SegmentAnalystSection";
import { SegmentClassificationSection } from "./SegmentClassificationSection";
import { SegmentDocumentationSection } from "./SegmentDocumentationSection";
import { SegmentKnowledgeBaseSection } from "./SegmentKnowledgeBaseSection";
import { SegmentModelSection } from "./SegmentModelSection";
import { SegmentProfilingSection } from "./SegmentProfilingSection";

type AgentSubTab =
  | "profiling"
  | "knowledge"
  | "classification"
  | "adversarial"
  | "analyst"
  | "documentation"
  | "modelo";

const SUBTAB_META: { key: AgentSubTab; label: string }[] = [
  { key: "knowledge", label: "Base de conocimiento" },
  { key: "profiling", label: "Perfilamiento" },
  { key: "classification", label: "Clasificación" },
  { key: "adversarial", label: "Adversarial" },
  { key: "analyst", label: "Analista" },
  { key: "documentation", label: "Descripción de campos" },
  { key: "modelo", label: "Modelo" },
];

/* ─── Agent config for one segment (Phase 4) ────────────
   Thin subtab router - mirrors SegmentAgentTab.tsx's segment-picker
   pattern. The picker itself stays outside any disabling fieldset (the
   bug caught in Phase 2: a picker wrapped in <fieldset disabled> becomes
   unclickable in read-only historical view) - only the section content
   below it is disabled. */

export function SegmentAgentSection({
  value,
  onChange,
  disabled,
}: {
  value: SegmentAgentConfig;
  onChange: (patch: Partial<SegmentAgentConfig>) => void;
  disabled?: boolean;
}) {
  const [subtab, setSubtab] = useState<AgentSubTab>("knowledge");
  // Enrichment variables (field categorizations' outputVariable) - citable
  // from every agent prompt in this segment, not just profiling's own.
  const enrichmentVariables = value.profiling.fieldCategorizations
    .map((fc) => fc.outputVariable)
    .filter((v) => v.trim().length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-card rounded-xl border border-border p-1.5 w-fit flex-wrap">
        {SUBTAB_META.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubtab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
              subtab === t.key ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subtab === "profiling" && (
        <SegmentProfilingSection
          value={value.profiling}
          onChange={(profiling) => onChange({ profiling })}
          extraVariables={enrichmentVariables}
          disabled={disabled}
        />
      )}
      {subtab === "knowledge" && (
        <SegmentKnowledgeBaseSection value={value} onChange={onChange} disabled={disabled} />
      )}
      {subtab === "classification" && (
        <SegmentClassificationSection
          value={value.classification}
          onChange={(classification) => onChange({ classification })}
          extraVariables={enrichmentVariables}
          disabled={disabled}
        />
      )}
      {subtab === "adversarial" && (
        <SegmentAdversarialSection
          value={value.adversarial}
          classification={value.classification}
          onChange={(adversarial) => onChange({ adversarial })}
          extraVariables={enrichmentVariables}
          disabled={disabled}
        />
      )}
      {subtab === "analyst" && (
        <SegmentAnalystSection
          value={value.analyst}
          taxonomies={value.taxonomies}
          onChange={(analyst) => onChange({ analyst })}
          extraVariables={enrichmentVariables}
          disabled={disabled}
        />
      )}
      {subtab === "documentation" && (
        <SegmentDocumentationSection
          value={value.documentation}
          onChange={(documentation) => onChange({ documentation })}
          extraVariables={enrichmentVariables}
          disabled={disabled}
        />
      )}
      {subtab === "modelo" && (
        <SegmentModelSection
          value={value.activeModelId}
          onChange={(activeModelId) => onChange({ activeModelId })}
          disabled={disabled}
        />
      )}
    </div>
  );
}
