import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Brain,
  Zap,
  ShieldAlert,
  Users,
  Bot,
  Cpu,
  Search,
  Fingerprint,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { MetricsFilterBar } from "@/components/MetricsFilterBar";
import { FilterBar, PageHeader } from "@/components/PageHeader";
import {
  CARD,
  ErrorBox,
  LoadingOverlay,
  MaturationBadge,
  MetricsNotices,
  RangeControl,
} from "@/components/metrics/MetricsShared";
import { initialRange, type RangeState } from "@/lib/api/metricsMapping";
import { useRole } from "@/hooks/useRole";
import { ReasoningEvaluationsDrawer } from "@/components/metrics/ReasoningEvaluationsDrawer";
import { OptimizerMonitorPanel } from "@/components/optimizer/OptimizerMonitorPanel";
import {
  getAgentMetrics,
  getTechnicalMetrics,
  type ApiMetricsWarning,
  type ApiResolutionMethod,
  type ApiResolutionMethodStats,
  type ApiAgentMetrics,
  type ApiTechnicalMetrics,
} from "@/lib/api/metrics.functions";
import {
  averageSeconds,
  falsePositiveRate,
  formatCount,
  formatDuration,
  formatPct,
  NO_DATA,
  ratio,
  toMetricsQuery,
  undetectedFraudRate,
  worstMaturation,
  type FilterSelection,
} from "@/lib/api/metricsMapping";

export const Route = createFileRoute("/monitor")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Telemetría y log de decisiones del agente ARIA." },
    ],
  }),
  component: MonitorPage,
});

// Above this share of failed steps / LLM errors in the range the agent is
// flagged as degraded (derived from the range's sums, not a live probe).
const MONITOR_TABS = [
  { value: "general", label: "Indicadores generales" },
  { value: "area", label: "Indicadores de área" },
  { value: "analistas", label: "Analistas y otros canales" },
  { value: "explicabilidad", label: "Explicabilidad" },
  { value: "tecnicos", label: "Indicadores técnicos" },
  { value: "recomendaciones", label: "% Recomendaciones" },
  { value: "optimizador", label: "Optimizador" },
] as const;
type MonitorTab = (typeof MONITOR_TABS)[number]["value"];
const MONITOR_TAB_KEY = "aria.monitor.tab";

// Last tab the user looked at; falls back to the first one (private window, unknown value).
function readMonitorTab(): MonitorTab {
  try {
    const saved = localStorage.getItem(MONITOR_TAB_KEY);
    return MONITOR_TABS.find((t) => t.value === saved)?.value ?? "general";
  } catch {
    return "general";
  }
}

const DEGRADED_THRESHOLD = 0.05;

// Voicebot and Bidi are not in operation yet: their sections stay defined but hidden.
const DISABLED_METHODS: ApiResolutionMethod[] = ["voicebot", "bidi"];

const ALL_METHOD_SECTIONS: { method: ApiResolutionMethod; title: string; icon: ReactNode }[] = [
  { method: "aria", title: "ARIA", icon: <Brain className="h-4 w-4" /> },
  { method: "analyst", title: "Analistas", icon: <Users className="h-4 w-4" /> },
  { method: "voicebot", title: "Voicebot", icon: <Bot className="h-4 w-4" /> },
  { method: "bidi", title: "Bidi", icon: <Fingerprint className="h-4 w-4" /> },
];

const METHOD_SECTIONS = ALL_METHOD_SECTIONS.filter((s) => !DISABLED_METHODS.includes(s.method));

function mergeWarnings(...lists: (ApiMetricsWarning[] | undefined)[]): ApiMetricsWarning[] {
  const byCode = new Map<string, ApiMetricsWarning>();
  for (const w of lists.flatMap((l) => l ?? [])) {
    const prev = byCode.get(w.code);
    byCode.set(
      w.code,
      prev ? { ...prev, periods: [...new Set([...prev.periods, ...w.periods])] } : w,
    );
  }
  return [...byCode.values()];
}

function MonitorPage() {
  const { user } = useRole();
  const [evaluationsOpen, setEvaluationsOpen] = useState(false);
  const [range, setRange] = useState<RangeState>(() => initialRange());
  const [tab, setTab] = useState<MonitorTab>(readMonitorTab);
  const changeTab = (value: string) => {
    setTab(value as MonitorTab);
    try {
      localStorage.setItem(MONITOR_TAB_KEY, value);
    } catch {
      // Private window: the choice only lasts for this visit.
    }
  };
  const [filters, setFilters] = useState<FilterSelection>({});
  const query = toMetricsQuery({ from: range.from, to: range.to }, filters);
  const key = [{ from: range.from, to: range.to }, query.filters];
  const agentQuery = useQuery({
    queryKey: ["metrics", "agent", ...key],
    queryFn: () => getAgentMetrics({ data: query }),
  });
  const technicalQuery = useQuery({
    queryKey: ["metrics", "technical", ...key],
    queryFn: () => getTechnicalMetrics({ data: query }),
  });
  const agent = agentQuery.data;
  const tech = technicalQuery.data;

  const methodStats = (m: ApiResolutionMethod) =>
    agent?.by_resolution_method.find((s) => s.resolution_method === m);
  const q = agent?.fraud_quality;
  const maturation = agent ? worstMaturation(agent.periods) : null;
  const steps = tech?.workflow_steps;
  const llm = tech?.llm_calls;
  const evals = tech?.evaluations;
  const stepFailRate = steps ? ratio(steps.failed, steps.executions) : null;
  const llmErrorRate = llm ? ratio(llm.errors, llm.calls) : null;
  const health: "ok" | "degraded" | "nodata" =
    stepFailRate === null && llmErrorRate === null
      ? "nodata"
      : (stepFailRate ?? 0) > DEGRADED_THRESHOLD || (llmErrorRate ?? 0) > DEGRADED_THRESHOLD
        ? "degraded"
        : "ok";
  const fetching = agentQuery.isFetching || technicalQuery.isFetching;

  const downloadReport = () => {
    if (
      !agent ||
      !tech ||
      fetching ||
      agent.range.from !== tech.range.from ||
      agent.range.to !== tech.range.to
    )
      return;
    const csv = buildMonitorReportCsv(agent, tech, filters);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-monitor-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderMethods = (include: (method: ApiResolutionMethod) => boolean) =>
    METHOD_SECTIONS.filter(({ method }) => include(method)).map(({ method, title, icon }) => (
      <MethodSection
        key={method}
        title={title}
        icon={icon}
        stats={methodStats(method)}
        total={agent?.totals.alerts ?? 0}
      >
        {method === "aria" && (
          <>
            <KpiCard
              label="Latencia LLM media"
              value={
                llm
                  ? formatDuration(averageSeconds(llm.latency.sum_seconds, llm.latency.count))
                  : "—"
              }
              tone="warning"
              detail={llm ? `${formatCount(llm.latency.count)} llamadas medidas` : ""}
              icon={<Zap className="h-4 w-4" />}
            />
            <KpiCard
              label="Tokens por llamada"
              value={
                llm
                  ? (() => {
                      const r = ratio(llm.input_tokens + llm.output_tokens, llm.calls);
                      return r === null ? NO_DATA : formatCount(r);
                    })()
                  : "—"
              }
              unit="tok"
              tone="primary"
              detail={
                llm
                  ? `${formatCount(llm.input_tokens)} entrada · ${formatCount(llm.output_tokens)} salida`
                  : ""
              }
              icon={<Brain className="h-4 w-4" />}
            />
          </>
        )}
      </MethodSection>
    ));

  return (
    <DashboardLayout>
      <div className="p-8 max-w-[1400px] space-y-6">
        {health === "degraded" && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-1.5 flex items-center gap-2 text-[12px] text-text-primary">
            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
            <span className="font-semibold">Agente degradado.</span>
            <span title={`Umbral ${formatPct(DEGRADED_THRESHOLD, 0)}`}>
              Pasos fallidos {formatPct(stepFailRate)} · errores LLM {formatPct(llmErrorRate)}
            </span>
          </div>
        )}

        <PageHeader
          title="Monitor del Agente"
          badge={<HealthBadge health={health} />}
          actions={
            <Button
              variant="outline"
              size="sm"
              className="h-[30px] text-[11px] gap-1.5"
              onClick={downloadReport}
              disabled={
                !agent ||
                !tech ||
                fetching ||
                agent.range.from !== tech.range.from ||
                agent.range.to !== tech.range.to
              }
            >
              <Download className="h-3.5 w-3.5" />
              Exportar reporte
            </Button>
          }
        />
        <FilterBar
          activeCount={Object.values(filters).filter(Boolean).length}
          onClear={() => setFilters({})}
          trailing={<RangeControl value={range} onChange={setRange} />}
        >
          <MetricsFilterBar
            value={filters}
            onChange={setFilters}
            dimensions={["segment", "channel", "subchannel", "amount_tier", "configuration_id"]}
            range={{ from: range.from, to: range.to }}
            canReadObservedValues={Boolean(user?.permissions.includes("dashboard"))}
          />
        </FilterBar>

        {agentQuery.isError && (
          <ErrorBox error={agentQuery.error} what="los indicadores del agente" />
        )}
        {technicalQuery.isError && (
          <ErrorBox error={technicalQuery.error} what="los indicadores técnicos" />
        )}
        <MetricsNotices warnings={mergeWarnings(agent?.warnings, tech?.warnings)} />

        <div className="relative space-y-6">
          {fetching && (
            <LoadingOverlay label="Calculando indicadores para el rango seleccionado…" />
          )}

          <Tabs value={tab} onValueChange={changeTab} className="space-y-4">
            <TabsList
              aria-label="Secciones del monitor"
              className="h-auto flex-wrap justify-start gap-1"
            >
              {MONITOR_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="text-[12px]">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="general" className="space-y-4">
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <KpiCard
                    label="Fraude no detectado"
                    value={q ? formatPct(undetectedFraudRate(q)) : "—"}
                    tone="danger"
                    detail={
                      q
                        ? `${formatCount(q.undetected_fraud)} de ${formatCount(q.decided)} decididas`
                        : ""
                    }
                    icon={<ShieldAlert className="h-4 w-4" />}
                    badge={<MaturationBadge maturation={maturation} />}
                  />
                  <KpiCard
                    label="Falsos positivos"
                    value={q ? formatPct(falsePositiveRate(q)) : "—"}
                    tone="warning"
                    detail={
                      q
                        ? `${formatCount(q.false_positives)} de ${formatCount(q.decided)} decididas`
                        : ""
                    }
                    icon={<AlertTriangle className="h-4 w-4" />}
                    badge={<MaturationBadge maturation={maturation} />}
                  />
                  <KpiCard
                    label="Errores de ejecución"
                    value={steps ? formatPct(stepFailRate) : "—"}
                    tone="danger"
                    detail={
                      steps
                        ? `${formatCount(steps.failed)} pasos fallidos de ${formatCount(steps.executions)} · ${formatCount(steps.retries)} reintentos`
                        : ""
                    }
                    icon={<AlertTriangle className="h-4 w-4" />}
                  />
                  <KpiCard
                    label="Errores LLM"
                    value={llm ? formatPct(llmErrorRate) : "—"}
                    tone="danger"
                    detail={
                      llm ? `${formatCount(llm.errors)} de ${formatCount(llm.calls)} llamadas` : ""
                    }
                    icon={<Cpu className="h-4 w-4" />}
                  />
                  <KpiCard
                    label="Disponibilidad"
                    value={NO_DATA}
                    tone="muted"
                    detail="Aún no hay una fuente de disponibilidad (uptime) conectada."
                    icon={<CheckCircle2 className="h-4 w-4" />}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="area" className="space-y-4">
              {renderMethods((m) => m === "aria")}
            </TabsContent>

            <TabsContent value="analistas" className="space-y-4">
              {renderMethods((m) => m !== "aria")}
            </TabsContent>

            <TabsContent value="explicabilidad">
              <div className={`${CARD} p-5`}>
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="h-4 w-4 text-primary" />
                  <h3 className="text-[13px] font-semibold text-text-primary">Explicabilidad</h3>
                  {evals && (
                    <span className="text-[11px] text-text-secondary">
                      · {formatCount(evals.evaluated)} decisiones evaluadas por muestreo (LLM-judge)
                      {evals.invalid > 0
                        ? ` · ${formatCount(evals.invalid)} evaluaciones inválidas`
                        : ""}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setEvaluationsOpen(true)}
                    className="ml-auto text-[12px] font-medium text-primary underline"
                  >
                    Ver alertas evaluadas
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ExplainCard
                    label="Alucinaciones"
                    value={evals ? formatPct(ratio(evals.hallucinations, evals.evaluated)) : "—"}
                    description="Decisiones evaluadas cuyo razonamiento afirma hechos que no están en los datos de la alerta."
                    tone={
                      evals && (ratio(evals.hallucinations, evals.evaluated) ?? 0) > 0.01
                        ? "warning"
                        : "primary"
                    }
                  />
                  <ExplainCard
                    label="Uso correcto de datos"
                    value={evals ? formatPct(ratio(evals.data_use_correct, evals.evaluated)) : "—"}
                    description="Decisiones evaluadas donde el agente citó y aplicó correctamente los datos disponibles."
                    tone={
                      evals && (ratio(evals.data_use_correct, evals.evaluated) ?? 1) < 0.95
                        ? "warning"
                        : "primary"
                    }
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tecnicos" className="space-y-4">
              <TechTable
                title="Pasos del workflow"
                icon={<Cpu className="h-4 w-4 text-primary" />}
                head={[
                  "Paso",
                  "Ejecuciones",
                  "Fallidos",
                  "% fallo",
                  "Reintentos",
                  "Duración media",
                ]}
                rows={(tech?.workflow_steps_by_step ?? []).map((s) => [
                  s.step_name,
                  formatCount(s.executions),
                  formatCount(s.failed),
                  formatPct(ratio(s.failed, s.executions)),
                  formatCount(s.retries),
                  formatDuration(averageSeconds(s.duration.sum_seconds, s.duration.count)),
                ])}
              />
              <TechTable
                title="Llamadas LLM por modelo"
                icon={<Brain className="h-4 w-4 text-primary" />}
                head={[
                  "Modelo",
                  "Llamadas",
                  "Errores",
                  "% error",
                  "Tokens entrada",
                  "Tokens salida",
                  "Latencia media",
                ]}
                rows={(tech?.llm_calls_by_model ?? []).map((m) => [
                  m.model,
                  formatCount(m.calls),
                  formatCount(m.errors),
                  formatPct(ratio(m.errors, m.calls)),
                  formatCount(m.input_tokens),
                  formatCount(m.output_tokens),
                  formatDuration(averageSeconds(m.latency.sum_seconds, m.latency.count)),
                ])}
              />
              <TechTable
                title="Investigación delegada por fuente"
                icon={<Search className="h-4 w-4 text-primary" />}
                head={["Fuente", "Llamadas", "OK", "Fallidas", "Timeout", "% OK"]}
                rows={(tech?.research_calls_by_source ?? []).map((r) => [
                  r.source,
                  formatCount(r.calls),
                  formatCount(r.ok),
                  formatCount(r.failed),
                  formatCount(r.timeout),
                  formatPct(ratio(r.ok, r.calls)),
                ])}
              />
            </TabsContent>

            <TabsContent value="recomendaciones">
              <section className={`${CARD} p-5`}>
                <div className="flex items-center gap-2 mb-5">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <h2 className="text-[13px] font-semibold text-text-primary uppercase tracking-wider">
                    % Recomendaciones
                  </h2>
                </div>
                {!agent ? (
                  <p className="text-[12px] text-text-secondary">—</p>
                ) : !agent.recommendations.available ? (
                  <div className="rounded-lg border border-border bg-surface px-4 py-3 text-[12px] text-text-secondary">
                    <span className="font-semibold text-text-primary">{NO_DATA}.</span>{" "}
                    {agent.recommendations.reason}
                  </div>
                ) : (
                  <RecommendationBars
                    accepted={agent.recommendations.accepted ?? 0}
                    ignored={agent.recommendations.ignored ?? 0}
                  />
                )}
              </section>
            </TabsContent>

            <TabsContent value="optimizador">
              <OptimizerMonitorPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <ReasoningEvaluationsDrawer open={evaluationsOpen} onOpenChange={setEvaluationsOpen} />
    </DashboardLayout>
  );
}

function csvValue(value: string | number) {
  const raw = String(value);
  return /[",;\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function csvLine(values: (string | number)[]) {
  return values.map(csvValue).join(",");
}

function buildMonitorReportCsv(
  agent: ApiAgentMetrics,
  tech: ApiTechnicalMetrics,
  filters: FilterSelection,
) {
  const lines = [
    "REPORTE DEL MONITOR ARIA",
    csvLine(["Generado", format(new Date(), "yyyy-MM-dd HH:mm")]),
    csvLine(["Desde", agent.range.from]),
    csvLine(["Hasta", agent.range.to]),
    csvLine(["Zona horaria", agent.range.timezone]),
    "",
    "FILTROS APLICADOS",
  ];
  for (const [name, value] of Object.entries(filters))
    if (value) lines.push(csvLine([name, value]));
  lines.push("", "ADVERTENCIAS DEL RANGO", csvLine(["Código", "Advertencia", "Periodos"]));
  for (const warning of [...agent.warnings, ...tech.warnings])
    lines.push(csvLine([warning.code, warning.message, warning.periods.join("; ")]));
  lines.push(
    "",
    "INDICADORES DEL AGENTE",
    csvLine(["Indicador", "Valor"]),
    csvLine(["Alertas", agent.totals.alerts]),
    csvLine(["Fraude no detectado", agent.fraud_quality.undetected_fraud]),
    csvLine(["Falsos positivos", agent.fraud_quality.false_positives]),
    csvLine(["Decididas", agent.fraud_quality.decided]),
    csvLine(["Tiempo de resolución (s)", agent.resolution_time.sum_seconds]),
    csvLine(["Dentro del SLA", agent.resolution_time.within_sla_count]),
    "",
    "PERIODOS DEL AGENTE",
    csvLine([
      "Periodo",
      "Nivel",
      "Parcial",
      "Maduración",
      "Alertas",
      "Decididas",
      "Falsos positivos",
      "Fraude no detectado",
    ]),
  );
  for (const period of agent.periods)
    lines.push(
      csvLine([
        period.period,
        period.level,
        period.partial ? "sí" : "no",
        period.maturation,
        period.alerts,
        period.decided,
        period.false_positives,
        period.undetected_fraud,
      ]),
    );
  lines.push("", "MÉTODOS DE RESOLUCIÓN", csvLine(["Método", "Alertas", "Fraude", "Sin fraude"]));
  for (const method of agent.by_resolution_method)
    lines.push(
      csvLine([method.resolution_method, method.alerts, method.fraud_marks, method.no_fraud_marks]),
    );
  lines.push(
    "",
    "PASOS DEL WORKFLOW",
    csvLine(["Paso", "Ejecuciones", "Correctas", "Fallidas", "Reintentos", "Duración (s)"]),
  );
  for (const step of tech.workflow_steps_by_step)
    lines.push(
      csvLine([
        step.step_name,
        step.executions,
        step.succeeded,
        step.failed,
        step.retries,
        step.duration.sum_seconds,
      ]),
    );
  lines.push(
    "",
    "LLAMADAS LLM",
    csvLine(["Modelo", "Llamadas", "Errores", "Tokens entrada", "Tokens salida", "Latencia (s)"]),
  );
  for (const model of tech.llm_calls_by_model)
    lines.push(
      csvLine([
        model.model,
        model.calls,
        model.errors,
        model.input_tokens,
        model.output_tokens,
        model.latency.sum_seconds,
      ]),
    );
  lines.push(
    "",
    "INVESTIGACIÓN DELEGADA",
    csvLine(["Fuente", "Llamadas", "Correctas", "Fallidas", "Timeout"]),
  );
  for (const source of tech.research_calls_by_source)
    lines.push(csvLine([source.source, source.calls, source.ok, source.failed, source.timeout]));
  lines.push(
    "",
    "EVALUACIONES",
    csvLine(["Evaluadas", "Alucinaciones", "Uso correcto de datos", "Inválidas"]),
    csvLine([
      tech.evaluations.evaluated,
      tech.evaluations.hallucinations,
      tech.evaluations.data_use_correct,
      tech.evaluations.invalid,
    ]),
    "",
    "PERIODOS TÉCNICOS",
    csvLine([
      "Periodo",
      "Nivel",
      "Parcial",
      "Maduración",
      "Ejecuciones",
      "Fallidas",
      "Llamadas LLM",
    ]),
  );
  for (const period of tech.periods)
    lines.push(
      csvLine([
        period.period,
        period.level,
        period.partial ? "sí" : "no",
        period.maturation,
        period.step_executions,
        period.step_failed,
        period.llm_calls,
      ]),
    );
  return lines.join("\n");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: "ok" | "degraded" | "nodata" }) {
  const meta = {
    ok: { label: "Operativo", className: "bg-success/10 text-success", dot: "bg-success" },
    degraded: { label: "Degradado", className: "bg-warning/10 text-warning", dot: "bg-warning" },
    nodata: {
      label: "Sin datos",
      className: "bg-text-secondary/10 text-text-secondary",
      dot: "bg-text-secondary",
    },
  }[health];
  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[12px] font-semibold ${meta.className}`}
    >
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function MethodSection({
  title,
  icon,
  stats,
  total,
  children,
}: {
  title: string;
  icon: ReactNode;
  stats: ApiResolutionMethodStats | undefined;
  total: number;
  children?: ReactNode;
}) {
  const rt = stats?.resolution_time;
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={`Procesado por ${title.toLowerCase() === "aria" ? "ARIA" : title.toLowerCase()}`}
          value={stats ? formatPct(ratio(stats.alerts, total)) : NO_DATA}
          tone="primary"
          detail={
            stats
              ? `${formatCount(stats.alerts)} alertas de ${formatCount(total)}`
              : "Sin alertas resueltas por este método en el rango."
          }
          icon={icon}
        />
        <KpiCard
          label="Marcadas fraude / no fraude"
          value={
            stats ? `${formatCount(stats.fraud_marks)} / ${formatCount(stats.no_fraud_marks)}` : "—"
          }
          tone="primary"
          detail={
            stats
              ? `FP ${formatPct(falsePositiveRate(stats.fraud_quality))} · no detectado ${formatPct(undetectedFraudRate(stats.fraud_quality))}`
              : ""
          }
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <KpiCard
          label="Tiempo medio de resolución"
          value={rt ? formatDuration(averageSeconds(rt.sum_seconds, rt.count)) : "—"}
          tone="warning"
          detail={rt ? `SLA <5 min ${formatPct(ratio(rt.within_sla_count, rt.count))}` : ""}
          icon={<Zap className="h-4 w-4" />}
        />
        {children}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  detail,
  tone,
  icon,
  badge,
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  tone: "primary" | "warning" | "danger" | "muted";
  icon: ReactNode;
  badge?: ReactNode;
}) {
  const toneClass =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "muted"
          ? "text-text-secondary"
          : "text-primary";
  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[11px] uppercase tracking-wider text-text-secondary">{label}</div>
        <span className={`${toneClass} opacity-60`}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={`text-[26px] font-bold leading-none ${toneClass}`}>{value}</span>
        {unit && value !== NO_DATA && (
          <span className="text-[12px] text-text-secondary">{unit}</span>
        )}
        {badge}
      </div>
      {detail && <div className="mt-2 text-[11px] text-text-secondary">{detail}</div>}
    </div>
  );
}

function ExplainCard({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  tone: "primary" | "warning";
}) {
  const toneClass =
    value === NO_DATA
      ? "text-text-secondary"
      : tone === "warning"
        ? "text-warning"
        : "text-primary";
  const bgClass =
    tone === "warning" ? "bg-warning/5 border-warning/20" : "bg-primary/5 border-primary/20";
  return (
    <div className={`rounded-lg border p-4 ${bgClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-semibold text-text-primary">{label}</span>
        <span className={`text-[22px] font-bold ${toneClass}`}>{value}</span>
      </div>
      <p className="text-[11px] text-text-secondary leading-relaxed">{description}</p>
    </div>
  );
}

function TechTable({
  title,
  icon,
  head,
  rows,
}: {
  title: string;
  icon: ReactNode;
  head: string[];
  rows: string[][];
}) {
  const columns: DataTableColumn<string[]>[] = head.map((label, index) => ({
    key: `column-${index}`,
    label,
    align: index === 0 ? undefined : "right",
    render: (row) => (
      <span className={index === 0 ? "text-text-primary" : "tabular-nums"}>
        {row[index] ?? "—"}
      </span>
    ),
    sortValue: (row) => row[index] ?? "",
    searchValue: (row) => row[index] ?? "",
  }));
  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-[13px] font-semibold text-text-primary">{title}</h3>
      </div>
      <DataTable
        storageKey={`monitor.${title}`}
        columns={columns}
        rows={rows}
        rowKey={(row) => row[0] ?? ""}
        pageSize={10}
        itemLabel="indicador"
        emptyLabel={`${NO_DATA} en el rango.`}
        defaultSort={{ key: "column-0", dir: "asc" }}
      />
    </div>
  );
}

function RecommendationBars({ accepted, ignored }: { accepted: number; ignored: number }) {
  const total = accepted + ignored;
  const bars = [
    { label: "Aceptadas", value: accepted, fill: "bg-success", text: "text-success" },
    { label: "Ignoradas", value: ignored, fill: "bg-warning", text: "text-warning" },
  ];
  return (
    <div className="max-w-md space-y-3">
      {bars.map((b) => {
        const pct = ratio(b.value, total);
        return (
          <div key={b.label}>
            <div className="flex justify-between text-[12px] mb-1">
              <span className="text-text-primary font-medium">{b.label}</span>
              <span className={`font-bold ${b.text}`}>{formatPct(pct)}</span>
            </div>
            <div className="h-2 bg-surface rounded-full overflow-hidden border border-border">
              <div
                className={`h-full rounded-full ${b.fill}`}
                style={{ width: `${(pct ?? 0) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
      <div className="pt-1 flex items-center justify-between text-[11px] text-text-secondary border-t border-border">
        <span>Total recomendaciones emitidas</span>
        <span className="font-semibold text-text-primary">{formatCount(total)}</span>
      </div>
    </div>
  );
}
