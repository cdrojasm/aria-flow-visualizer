import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export const Route = createFileRoute("/monitor")({
  head: () => ({
    meta: [
      { title: "Monitor del Agente · ARIA" },
      { name: "description", content: "Telemetría y log de decisiones del agente ARIA." },
    ],
  }),
  component: MonitorPage,
});

type Decision = {
  ts: string;
  alertId: string;
  taxonomy: string;
  taxVerdict: string;
  adversarialCorrected: boolean;
  finalVerdict: string;
  result: "Auto-resuelto" | "Derivado" | "Error";
  reasoning: Record<string, unknown>;
};

const decisions: Decision[] = [
  { ts: "10:48:12", alertId: "ALR-48210", taxonomy: "card-present geo anomaly", taxVerdict: "Probable fraude", adversarialCorrected: false, finalVerdict: "Probable fraude", result: "Auto-resuelto",
    reasoning: { confidence: 0.94, signals: ["geo_mismatch", "amount_spike"], adversarial: { agreed: true } } },
  { ts: "10:47:51", alertId: "ALR-48209", taxonomy: "phishing redirect", taxVerdict: "Sospechoso", adversarialCorrected: true, finalVerdict: "Falso positivo", result: "Auto-resuelto",
    reasoning: { confidence: 0.41, signals: ["url_pattern"], adversarial: { agreed: false, reason: "domain whitelisted last 24h" } } },
  { ts: "10:47:22", alertId: "ALR-48208", taxonomy: "money mule pattern", taxVerdict: "Incierto", adversarialCorrected: false, finalVerdict: "Incierto", result: "Derivado",
    reasoning: { confidence: 0.58, signals: ["circular_transfer", "new_beneficiary"] } },
  { ts: "10:46:58", alertId: "ALR-48207", taxonomy: "identity takeover", taxVerdict: "Probable fraude", adversarialCorrected: true, finalVerdict: "Revisar", result: "Derivado",
    reasoning: { confidence: 0.72, adversarial: { agreed: false, reason: "device known 90d" } } },
  { ts: "10:46:30", alertId: "ALR-48206", taxonomy: "card-present geo anomaly", taxVerdict: "Falso positivo", adversarialCorrected: false, finalVerdict: "Falso positivo", result: "Auto-resuelto",
    reasoning: { confidence: 0.88, signals: ["travel_notice_active"] } },
  { ts: "10:46:02", alertId: "ALR-48205", taxonomy: "laundering layering", taxVerdict: "Probable fraude", adversarialCorrected: false, finalVerdict: "Probable fraude", result: "Auto-resuelto",
    reasoning: { confidence: 0.91 } },
  { ts: "10:45:41", alertId: "ALR-48204", taxonomy: "phishing redirect", taxVerdict: "Sospechoso", adversarialCorrected: false, finalVerdict: "Sospechoso", result: "Error",
    reasoning: { confidence: 0.66, error: "tool_timeout: enrichment.ip_reputation" } },
  { ts: "10:45:12", alertId: "ALR-48203", taxonomy: "money mule pattern", taxVerdict: "Probable fraude", adversarialCorrected: true, finalVerdict: "Falso positivo", result: "Auto-resuelto",
    reasoning: { confidence: 0.37, adversarial: { agreed: false } } },
  { ts: "10:44:55", alertId: "ALR-48202", taxonomy: "card-not-present", taxVerdict: "Probable fraude", adversarialCorrected: false, finalVerdict: "Probable fraude", result: "Derivado",
    reasoning: { confidence: 0.81 } },
];

const taxonomies = Array.from(new Set(decisions.map((d) => d.taxonomy)));
const results = ["Auto-resuelto", "Derivado", "Error"] as const;

// Confidence histogram buckets (deciles)
const confidenceDist = [12, 18, 24, 9, 7, 11, 14, 22, 38, 56];

function MonitorPage() {
  const agentStatus: "ok" | "degraded" = "degraded";
  const [taxFilter, setTaxFilter] = useState<string>("all");
  const [resFilter, setResFilter] = useState<string>("all");
  const [advFilter, setAdvFilter] = useState<"all" | "yes" | "no">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"json" | "human">("human");

  const filtered = useMemo(() => decisions.filter((d) => {
    if (taxFilter !== "all" && d.taxonomy !== taxFilter) return false;
    if (resFilter !== "all" && d.result !== resFilter) return false;
    if (advFilter === "yes" && !d.adversarialCorrected) return false;
    if (advFilter === "no" && d.adversarialCorrected) return false;
    return true;
  }), [taxFilter, resFilter, advFilter]);

  const lowConfShare = (confidenceDist[0] + confidenceDist[1] + confidenceDist[2]) /
    confidenceDist.reduce((a, b) => a + b, 0);
  const highLowConf = lowConfShare > 0.25;
  const maxBucket = Math.max(...confidenceDist);

  return (
    <DashboardLayout>
      <div className="p-8 max-w-[1400px]">
        {agentStatus === "degraded" && (
          <div className="mb-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="text-[13px] text-text-primary">
              <span className="font-semibold">Agente degradado.</span> Latencia de enriquecimiento por encima del umbral y un sub-agente reportando timeouts intermitentes.
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-[20px] font-semibold text-text-primary">Monitor del Agente</h1>
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-warning/10 text-warning text-[12px] font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-warning opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
            </span>
            Degradado
          </span>
        </div>

        {/* Health cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <HealthCard label="Latencia promedio / etapa" value="842" unit="ms" trend="up" delta="+18% vs 1h" tone="warning" />
          <HealthCard label="Errores de herramientas" value="6.4" unit="%" trend="up" delta="umbral 4%" tone="danger" />
          <HealthCard label="Alertas en procesamiento" value="23" unit="" trend="down" delta="-4 vs 5m" tone="primary" />
          <HealthCard label="Reversiones adversariales" value="11" unit="turno" trend="up" delta="+3 vs turno previo" tone="primary" />
        </div>

        <div className="grid grid-cols-[2fr_1fr] gap-6">
          {/* Decision log */}
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-text-primary">Log de decisiones</h2>
              <div className="flex items-center gap-2">
                <Select value={taxFilter} onChange={setTaxFilter} options={[["all", "Toda taxonomía"], ...taxonomies.map((t) => [t, t] as [string, string])]} />
                <Select value={resFilter} onChange={setResFilter} options={[["all", "Todo resultado"], ...results.map((r) => [r, r] as [string, string])]} />
                <Select value={advFilter} onChange={(v) => setAdvFilter(v as any)} options={[["all", "Adversarial: todo"], ["yes", "Solo corregidas"], ["no", "Sin corrección"]]} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-surface text-text-secondary">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5"></th>
                    <th className="text-left font-medium px-3 py-2.5">Timestamp</th>
                    <th className="text-left font-medium px-3 py-2.5">ID</th>
                    <th className="text-left font-medium px-3 py-2.5">Taxonomía</th>
                    <th className="text-left font-medium px-3 py-2.5">Veredicto tax.</th>
                    <th className="text-left font-medium px-3 py-2.5">Adversarial</th>
                    <th className="text-left font-medium px-3 py-2.5">Final</th>
                    <th className="text-left font-medium px-3 py-2.5">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const open = expanded === d.alertId;
                    return (
                      <Fragment key={d.alertId}>
                        <tr
                          className="border-t border-border hover:bg-surface cursor-pointer"
                          onClick={() => setExpanded(open ? null : d.alertId)}
                        >
                          <td className="px-4 py-2.5 text-text-secondary">
                            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-text-secondary">{d.ts}</td>
                          <td className="px-3 py-2.5 font-mono text-text-primary">{d.alertId}</td>
                          <td className="px-3 py-2.5 text-text-primary">{d.taxonomy}</td>
                          <td className="px-3 py-2.5 text-text-primary">{d.taxVerdict}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                              d.adversarialCorrected ? "bg-warning/10 text-warning" : "bg-surface text-text-secondary"
                            }`}>
                              {d.adversarialCorrected ? "Sí" : "No"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-text-primary font-medium">{d.finalVerdict}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                              d.result === "Auto-resuelto" ? "bg-success/10 text-success" :
                              d.result === "Derivado" ? "bg-primary-light text-primary" :
                              "bg-danger/10 text-danger"
                            }`}>{d.result}</span>
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-t border-border bg-surface">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-[12px] font-medium text-text-primary">Razonamiento completo</span>
                                <div className="inline-flex rounded-md border border-border bg-background text-[11px]">
                                  <button
                                    onClick={() => setViewMode("human")}
                                    className={`px-2.5 py-1 rounded-l-md ${viewMode === "human" ? "bg-primary text-white" : "text-text-secondary"}`}
                                  >Legible</button>
                                  <button
                                    onClick={() => setViewMode("json")}
                                    className={`px-2.5 py-1 rounded-r-md ${viewMode === "json" ? "bg-primary text-white" : "text-text-secondary"}`}
                                  >JSON</button>
                                </div>
                              </div>
                              {viewMode === "json" ? (
                                <pre className="text-[11px] bg-background border border-border rounded-md p-3 overflow-auto leading-relaxed">{JSON.stringify(d.reasoning, null, 2)}</pre>
                              ) : (
                                <ul className="text-[12px] text-text-primary space-y-1.5">
                                  {Object.entries(d.reasoning).map(([k, v]) => (
                                    <li key={k}>
                                      <span className="text-text-secondary">{k}:</span>{" "}
                                      <span className="font-medium">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Confidence distribution */}
          <section className={`rounded-xl border p-5 ${highLowConf ? "border-warning/40 bg-warning/5" : "border-border bg-card"} shadow-[0_1px_4px_rgba(0,0,0,0.06)]`}>
            <h2 className="text-[14px] font-semibold text-text-primary mb-1">Distribución de confianza</h2>
            <p className="text-[11px] text-text-secondary mb-4">Decisiones del turno por rango de confianza</p>
            <div className="flex items-end gap-1.5 h-40 mb-3">
              {confidenceDist.map((v, i) => {
                const opacity = 0.25 + (i / 9) * 0.75;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-sm bg-primary"
                      style={{ height: `${(v / maxBucket) * 100}%`, opacity }}
                      title={`${i * 10}-${(i + 1) * 10}%: ${v}`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-text-secondary mb-4">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
            {highLowConf && (
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                <p className="text-[11px] text-text-primary leading-relaxed">
                  Alta concentración de decisiones con baja confianza — revisar taxonomías.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function HealthCard({
  label, value, unit, trend, delta, tone,
}: {
  label: string; value: string; unit: string;
  trend: "up" | "down"; delta: string;
  tone: "primary" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger" ? "text-danger" :
    tone === "warning" ? "text-warning" :
    "text-primary";
  const TrendIcon = trend === "up" ? TrendingUp : TrendingDown;
  return (
    <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
      <div className="text-[11px] uppercase tracking-wider text-text-secondary mb-2">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-[32px] font-bold ${toneClass}`}>{value}</span>
        {unit && <span className="text-[13px] text-text-secondary">{unit}</span>}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-text-secondary">
        <TrendIcon className={`h-3.5 w-3.5 ${toneClass}`} />
        <span>{delta}</span>
      </div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 px-2.5 rounded-md border border-border bg-background text-[12px] text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
