import { useState } from "react";

import { defaultSegmentAgent, type SegmentAgentConfig } from "@/data/configs";
import { Badge } from "@/components/ui/badge";
import { SegmentAdversarialSection } from "./SegmentAdversarialSection";
import { SegmentAnalystSection } from "./SegmentAnalystSection";
import { SegmentClassificationSection } from "./SegmentClassificationSection";
import { SegmentDetectorSection } from "./SegmentDetectorSection";
import { SegmentExecutorSection } from "./SegmentExecutorSection";
import { SegmentProfilingSection } from "./SegmentProfilingSection";
import { SegmentDeterministicSection } from "./SegmentDeterministicSection";
import { SegmentStageJsonInspector } from "./SegmentStageJsonInspector";

type AgentSubTab =
  | "deterministic"
  | "profiling"
  | "detector"
  | "detectorAdversarial"
  | "classification"
  | "adversarial"
  | "analyst"
  | "executor";

// warningNote flags a subtab whose config is saved correctly but that the
// Celery alert-review workflow (alert_review_workflow.py's LINEAR_STEPS)
// does not read yet - keeps channel managers from assuming these fields
// change how a real alert is processed until the backend work lands.
// Remove each entry's note once its backend wiring ships.
const SUBTAB_META: {
  key: AgentSubTab;
  label: string;
  description: string;
  warningNote?: string;
}[] = [
  {
    key: "deterministic",
    label: "Determinístico",
    description: "Define decisiones directas basadas en condiciones, sin depender de un modelo.",
  },
  {
    key: "profiling",
    label: "Perfilamiento",
    description:
      "Ingeniería de características → cadena de perfilamiento → rúbricas. Configura las señales, construye el contexto de la alerta y define cómo se evalúa el riesgo.",
  },
  {
    key: "detector",
    label: "Detector",
    description:
      "Define las herramientas (incluido el modelo XGBoost) y el prompt para detectar alertas que ameritan una investigación más profunda.",
  },
  {
    key: "detectorAdversarial",
    label: "Adversarial (detector)",
    description: "Contrasta la detección para cuestionar y reforzar el resultado.",
  },
  {
    key: "classification",
    label: "Clasificación",
    description: "Define las herramientas y el prompt para clasificar cada alerta.",
  },
  {
    key: "adversarial",
    label: "Adversarial (clasificador)",
    description: "Contrasta la clasificación para cuestionar y reforzar el resultado.",
  },
  {
    key: "analyst",
    label: "Analista",
    description:
      "Define el prompt con el que el agente resuelve la alerta usando el playbook de Biblioteca.",
  },
  {
    key: "executor",
    label: "Ejecutor",
    description:
      "Define la marcación ARIC, la llamada al voicebot, la documentación final y el escalado al analista.",
  },
];

/* ─── Agent config for one segment (Phase 4, Wave 6 pipeline) ──
   Thin subtab router - mirrors SegmentAgentTab.tsx's segment-picker
   pattern. The picker itself stays outside any disabling fieldset (the
   bug caught in Phase 2: a picker wrapped in <fieldset disabled> becomes
   unclickable in read-only historical view) - only the section content
   below it is disabled. Subtab order mirrors the agent pipeline:
   Detector -> its Adversarial -> Clasificación -> its Adversarial ->
   Analista -> Ejecutor (item 6: Detector runs before Clasificación,
   immediately followed by its own adversarial). "Base de conocimiento" was
   removed as a subtab here (item 8/9) - that content now lives globally,
   versioned, in Biblioteca -> Repositorio de Conocimiento. */

export function SegmentAgentSection({
  value,
  onChange,
  disabled,
}: {
  value: SegmentAgentConfig;
  onChange: (patch: Partial<SegmentAgentConfig>) => void;
  disabled?: boolean;
}) {
  const [subtab, setSubtab] = useState<AgentSubTab>("deterministic");
  // Saved configurations created before the deterministic/rubric release
  // do not have these keys. Normalize at the UI boundary so opening an old
  // version never crashes; its missing defaults will be persisted on save.
  const defaults = defaultSegmentAgent();
  const deterministic = value.deterministic ?? defaults.deterministic;
  const profiling = value.profiling ?? defaults.profiling;
  const rubrics = value.rubrics ?? defaults.rubrics;
  const detector = value.detector ?? defaults.detector;
  const detectorAdversarial = value.detectorAdversarial ?? defaults.detectorAdversarial;
  // Preserve variables from legacy saved enrichment configurations so
  // existing prompts continue to resolve after that editor was removed.
  const enrichmentVariables = profiling.fieldEnrichment.recipes
    .filter((r) => r.enabled)
    .map((r) => r.name);
  const activeSubtab = SUBTAB_META.find((item) => item.key === subtab)!;
  const stageValue =
    subtab === "deterministic"
      ? deterministic
      : subtab === "profiling"
        ? { ...profiling, rubrics }
        : subtab === "detector"
          ? detector
          : subtab === "detectorAdversarial"
            ? detectorAdversarial
            : subtab === "classification"
              ? value.classification
              : subtab === "adversarial"
                ? value.adversarial
                : subtab === "analyst"
                  ? value.analyst
                  : value.executor;

  return (
    <div className="space-y-4">
      <div className="sticky top-[50px] z-20 -mx-1 bg-background/95 py-2 backdrop-blur">
        <div className="flex items-center gap-1 bg-card rounded-xl border border-border p-1.5 w-fit flex-wrap">
          {SUBTAB_META.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubtab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                subtab === t.key
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.label}
              {t.warningNote && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-amber-400"
                  title="Aún no conectado al motor de ejecución"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-1">
        <h2 className="text-[15px] font-semibold text-text-primary">{activeSubtab.label}</h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">{activeSubtab.description}</p>
        {activeSubtab.warningNote && (
          <Badge
            variant="outline"
            className="mt-2 block w-fit whitespace-normal border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
          >
            ⚠️ {activeSubtab.warningNote}
          </Badge>
        )}
      </div>

      {subtab === "deterministic" && (
        <SegmentDeterministicSection
          value={deterministic}
          onChange={(deterministic) => onChange({ deterministic })}
          disabled={disabled}
        />
      )}

      {subtab === "profiling" && (
        <SegmentProfilingSection
          value={profiling}
          onChange={(profiling) => onChange({ profiling })}
          extraVariables={enrichmentVariables}
          rubrics={rubrics}
          onRubricsChange={(rubrics) => onChange({ rubrics })}
          rubricVariables={deterministic.fieldEnrichment.recipes
            .filter((r) => r.enabled)
            .map((r) => r.name)}
          disabled={disabled}
        />
      )}
      {subtab === "detector" && (
        <SegmentDetectorSection
          value={detector}
          onChange={(detector) => onChange({ detector })}
          extraVariables={enrichmentVariables}
          disabled={disabled}
        />
      )}
      {subtab === "detectorAdversarial" && (
        <SegmentAdversarialSection
          value={detectorAdversarial}
          onChange={(detectorAdversarial) =>
            onChange({
              detectorAdversarial: {
                ...detectorAdversarial,
                maxThoughtIterations: detectorAdversarial.maxThoughtIterations ?? 5,
              },
            })
          }
          extraVariables={enrichmentVariables}
          disabled={disabled}
          showMaxThoughtIterations
        />
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
          onChange={(adversarial) => onChange({ adversarial })}
          extraVariables={enrichmentVariables}
          disabled={disabled}
        />
      )}
      {subtab === "analyst" && (
        <SegmentAnalystSection
          value={value.analyst ?? defaults.analyst}
          onChange={(analyst) => onChange({ analyst })}
          extraVariables={enrichmentVariables}
          disabled={disabled}
        />
      )}
      {subtab === "executor" && (
        <SegmentExecutorSection
          value={value.executor}
          onChange={(executor) => onChange({ executor })}
          extraVariables={enrichmentVariables}
          disabled={disabled}
        />
      )}
      <SegmentStageJsonInspector stage={subtab} value={stageValue} />
    </div>
  );
}
