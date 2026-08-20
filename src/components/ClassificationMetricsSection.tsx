import type { ClassificationMetrics } from "@/lib/api/testing.functions";

// Two independent ground-truth comparisons (see backend
// classification_metrics.py): the model's is_fraud call against the
// analyst's marcacion_final, and against the real matured outcome (tipo).
// Each gets its own fixed label order/text so the matrix renders
// consistently even when a class has zero cases this run.
const ANALYST_EXPECTED = ["no-risk", "risk-suspected", "risk"] as const;
const ANALYST_PREDICTED = ANALYST_EXPECTED;
const GROUND_TRUTH_EXPECTED = ["Fraude", "NoFraude"] as const;
const GROUND_TRUTH_PREDICTED = ["Fraude", "NoFraude", "unknown"] as const;

const LABEL_TEXT: Record<string, string> = {
  "no-risk": "No riesgo",
  "risk-suspected": "Riesgo dudoso",
  risk: "Riesgo inminente",
  Fraude: "Fraude",
  NoFraude: "No fraude",
  unknown: "No concluyente",
};

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function ClassificationMetricsSection({
  analystAgreement,
  groundTruth,
}: {
  analystAgreement: ClassificationMetrics | null;
  groundTruth: ClassificationMetrics | null;
}) {
  if (!analystAgreement && !groundTruth) return null;

  return (
    <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
          Resultados de clasificación
        </h2>
        <p className="text-[11px] text-text-secondary mt-1">
          Dos comparaciones independientes: contra la marcación del analista y contra el desenlace
          real (tipo) una vez madura el caso.
        </p>
      </div>
      <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <MetricsPanel
          title="Modelo vs. Analista"
          subtitle="¿El modelo triage igual que el analista? (marcacion_final)"
          metrics={analystAgreement}
          expectedLabels={ANALYST_EXPECTED}
          predictedLabels={ANALYST_PREDICTED}
        />
        <MetricsPanel
          title="Modelo vs. Verdad real"
          subtitle="¿El modelo acierta el fraude real, madurado? (tipo)"
          metrics={groundTruth}
          expectedLabels={GROUND_TRUTH_EXPECTED}
          predictedLabels={GROUND_TRUTH_PREDICTED}
        />
      </div>
    </section>
  );
}

function MetricsPanel({
  title,
  subtitle,
  metrics,
  expectedLabels,
  predictedLabels,
}: {
  title: string;
  subtitle: string;
  metrics: ClassificationMetrics | null;
  expectedLabels: readonly string[];
  predictedLabels: readonly string[];
}) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary">{title}</h3>
        <p className="text-[11px] text-text-secondary mt-0.5">{subtitle}</p>
      </div>
      {!metrics ? (
        <p className="text-[12px] text-text-secondary italic py-4">
          Aún no hay casos con clasificación concluida para calcular esto.
        </p>
      ) : (
        <>
          <ConfusionMatrix
            metrics={metrics}
            expectedLabels={expectedLabels}
            predictedLabels={predictedLabels}
          />
          <PerClassTable metrics={metrics} expectedLabels={expectedLabels} />
        </>
      )}
    </div>
  );
}

function ConfusionMatrix({
  metrics,
  expectedLabels,
  predictedLabels,
}: {
  metrics: ClassificationMetrics;
  expectedLabels: readonly string[];
  predictedLabels: readonly string[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="text-[11px] border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="text-left text-text-secondary font-medium pb-1 pr-2">Real \ Predicho</th>
            {predictedLabels.map((label) => (
              <th
                key={label}
                className="text-center text-text-secondary font-medium pb-1 px-2 whitespace-nowrap"
              >
                {LABEL_TEXT[label] ?? label}
              </th>
            ))}
            <th className="text-center text-text-secondary font-medium pb-1 pl-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {expectedLabels.map((expected) => {
            const row = metrics.confusion_matrix[expected] ?? {};
            const rowTotal = predictedLabels.reduce((sum, p) => sum + (row[p] ?? 0), 0);
            return (
              <tr key={expected}>
                <td className="text-text-secondary font-medium pr-2 py-0.5 whitespace-nowrap">
                  {LABEL_TEXT[expected] ?? expected}
                </td>
                {predictedLabels.map((predicted) => {
                  const count = row[predicted] ?? 0;
                  const correct = predicted === expected;
                  const share = rowTotal > 0 ? count / rowTotal : 0;
                  const intensityPct = count === 0 ? 0 : Math.max(12, Math.round(share * 90));
                  const tone = correct ? "var(--color-success)" : "var(--color-danger)";
                  return (
                    <td key={predicted} className="p-0.5">
                      <div
                        className="rounded-md text-center py-1.5 px-2 font-mono text-text-primary"
                        style={{
                          backgroundColor:
                            count === 0
                              ? "transparent"
                              : `color-mix(in srgb, ${tone} ${intensityPct}%, transparent)`,
                        }}
                      >
                        {count}
                      </div>
                    </td>
                  );
                })}
                <td className="text-center font-mono text-text-secondary pl-2">{rowTotal}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PerClassTable({
  metrics,
  expectedLabels,
}: {
  metrics: ClassificationMetrics;
  expectedLabels: readonly string[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-text-secondary">
            <th className="font-medium pr-3 py-1">Clase</th>
            <th className="font-medium pr-3 py-1">Precision</th>
            <th className="font-medium pr-3 py-1">Recall</th>
            <th className="font-medium pr-3 py-1">F1</th>
            <th className="font-medium py-1">Soporte</th>
          </tr>
        </thead>
        <tbody className="font-mono text-text-primary">
          {expectedLabels.map((label) => {
            const cls = metrics.per_class[label];
            if (!cls) return null;
            return (
              <tr key={label} className="border-t border-border">
                <td className="pr-3 py-1 font-sans">{LABEL_TEXT[label] ?? label}</td>
                <td className="pr-3 py-1">
                  <MetricBar value={cls.precision} />
                </td>
                <td className="pr-3 py-1">
                  <MetricBar value={cls.recall} />
                </td>
                <td className="pr-3 py-1">
                  <MetricBar value={cls.f1} />
                </td>
                <td className="py-1">{cls.support}</td>
              </tr>
            );
          })}
          <tr className="border-t border-border text-text-secondary">
            <td className="pr-3 py-1 font-sans font-semibold">Macro-avg</td>
            <td className="pr-3 py-1">{fmtPct(metrics.macro_precision)}</td>
            <td className="pr-3 py-1">{fmtPct(metrics.macro_recall)}</td>
            <td className="pr-3 py-1">{fmtPct(metrics.macro_f1)}</td>
            <td className="py-1">{metrics.total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MetricBar({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-9 shrink-0">{fmtPct(value)}</span>
      <span className="w-12 h-1.5 rounded-full bg-surface overflow-hidden inline-block">
        <span
          className="block h-full rounded-full bg-primary/70"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
    </span>
  );
}
