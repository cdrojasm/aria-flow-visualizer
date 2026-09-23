import { ChevronDown } from "lucide-react";

type Stage =
  | "parser"
  | "deterministic"
  | "profiling"
  | "detector"
  | "detectorAdversarial"
  | "classification"
  | "adversarial"
  | "analyst"
  | "executor"
  | "modelo";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const outputFor = (stage: Stage, value: unknown) => {
  const config = asRecord(value);

  switch (stage) {
    case "parser":
      return {
        normalizedFields: asRecords(config.fields).map((field) => ({
          source: field.sourceField,
          alias: field.alias,
          type: field.type,
        })),
      };
    case "deterministic":
      return {
        decisions: asRecords(config.rules).map((rule) => ({
          variable: rule.variable,
          decision: rule.decision,
          aricAction: rule.aricAction,
        })),
      };
    case "profiling":
      return {
        variables: asRecords(asRecord(config.fieldEnrichment).recipes)
          .filter((recipe) => recipe.enabled)
          .map((recipe) => recipe.name),
        strategies: asRecords(config.strategies).map((strategy) => strategy.key),
        rubrics: asRecords(config.rubrics).map((rubric) => rubric.name),
      };
    case "detector":
      return {
        detection: "resultado_de_deteccion",
        outputLabels: asList(config.outputLabels),
        tools: [
          ...(config.vectorStoreEnabled ? ["vector_store"] : []),
          ...(config.watchlistEnabled ? ["watchlist"] : []),
          ...(config.calculatorEnabled ? ["calculator"] : []),
          ...(config.useXgboostModel ? ["xgboost_model"] : []),
          ...(config.enablePandasHistoryTool ? ["pandas_history"] : []),
        ],
      };
    case "detectorAdversarial":
      return {
        validation: "retroalimentacion_adversarial_detector",
        cycles: config.maxCycles ?? 0,
        maxThoughtIterations: config.maxThoughtIterations ?? 5,
        outputLabels: asList(config.outputLabels),
      };
    case "classification":
      return {
        classification: "resultado_de_clasificacion",
        tools: [
          ...(config.vectorStoreEnabled ? ["vector_store"] : []),
          ...(config.watchlistEnabled ? ["watchlist"] : []),
          ...(config.calculatorEnabled ? ["calculator"] : []),
        ],
        maxThoughtIterations: config.maxThoughtIterations ?? 5,
      };
    case "adversarial":
      return { validation: "retroalimentacion_adversarial", cycles: config.maxCycles ?? 0 };
    case "analyst":
      return { actions: asRecords(config.playbooks).map((playbook) => playbook.name) };
    case "executor":
      return {
        aricComment: "comentario_de_marcacion",
        voicebot: Boolean(config.voicebotCall),
        document:
          asRecord(config.documentador).strategy === "template"
            ? "documentacion_por_plantilla"
            : "documentacion_por_agente",
        analystConcept: "concepto_para_analista",
      };
    case "modelo":
      return { score: value ? "puntaje_del_modelo" : null, modelId: value ?? null };
  }
};

/** A transparent contract preview: configuration consumed by the stage and the fields it produces. */
export function SegmentStageJsonInspector({ stage, value }: { stage: Stage; value: unknown }) {
  const inputs = value;
  const outputs = outputFor(stage, value);

  return (
    <details className="group rounded-xl border border-border bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-text-primary">
        Visualizador de contrato JSON
        <ChevronDown className="h-4 w-4 text-text-secondary transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-4 grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
        <JsonBlock label="Entradas" value={inputs} />
        <JsonBlock label="Salidas" value={outputs} />
      </div>
    </details>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-medium text-text-primary">{label}</h3>
      <pre className="max-h-80 overflow-auto rounded-lg bg-muted/30 p-3 font-mono text-[12px] leading-5 text-text-secondary">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
