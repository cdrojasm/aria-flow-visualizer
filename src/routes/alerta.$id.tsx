import { StepLlmBadge } from "@/components/llm/StepLlmBadge";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { curateAlertToDataset } from "@/lib/api/alerts.functions";
import {
  getActiveAlertSchema,
  getAlertRaw,
  getAlertSchemaVersion,
  type AlertSchemaVersion,
} from "@/lib/api/alertSchema.functions";
import { AlertSchemaView, type CanonicalAlertData } from "@/components/alert/AlertSchemaView";
import { AlertFlowDiagrams } from "@/components/alert/AlertFlowDiagrams";
import { ReasoningEvaluationTab } from "@/components/alert/ReasoningEvaluationTab";
import { getDatasets } from "@/lib/api/datasets.functions";
import { useRole } from "@/hooks/useRole";
import {
  getAlertDetail,
  queueConflictCode,
  releaseAlert,
  resolveAlert,
  takeAlert,
  type AlertDetail,
  type AlertStep,
  type AnalystResolution,
} from "@/lib/api/operations.functions";
import { STEP_LABELS } from "@/lib/alertSteps";
import { RESOLUTION_TAG_LABELS, type ResolutionTag } from "@/data/configs";

export const Route = createFileRoute("/alerta/$id")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Detalle completo de la alerta y razonamiento del agente." },
    ],
  }),
  component: AlertaDetailPage,
});

type AlertTab = "resumen" | "razonamiento" | "calidad" | "data" | "usuario" | "historial" | "raw";

const TABS: { id: AlertTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "razonamiento", label: "Razonamiento del agente" },
  { id: "data", label: "Data alerta" },
  { id: "usuario", label: "Usuario" },
  { id: "historial", label: "Historial" },
];

const RESOLUTION_LABELS: Record<string, string> = {
  block: "Fraude confirmado (bloqueada)",
  pass: "Falso positivo (dejada pasar)",
  bidi: "Enviada a bidi",
};

const DECISION_LABELS: Record<string, string> = {
  block: "Bloquear",
  pass: "Dejar pasar",
  bidi: "Bidi",
  voicebot: "Voicebot",
  scale_to_analyst: "Escalar a analista",
  none: "Sin acción",
};

const ALERT_STATUS: Record<string, { label: string; className: string }> = {
  RECEIVED: { label: "Recibida", className: "bg-text-secondary/10 text-text-secondary" },
  PROCESSING: { label: "ARIA analizando", className: "bg-primary/10 text-primary" },
  ESCALATED: { label: "Esperando analista", className: "bg-warning/10 text-warning" },
  CLOSED: { label: "Cerrada", className: "bg-success/10 text-success" },
  SKIPPED: {
    label: "Saltada (agente apagado)",
    className: "bg-text-secondary/10 text-text-secondary",
  },
  FAILED: { label: "Falló", className: "bg-danger/10 text-danger" },
};

const TAKE_ERRORS: Record<string, string> = {
  analyst_busy:
    "Ya estás atendiendo otra alerta: esta queda en solo lectura hasta que resuelvas o liberes la tuya.",
  alert_taken: "Otro analista tomó esta alerta.",
  no_capacity:
    "No hay analistas disponibles en la matriz para esta hora (o los analistas están apagados).",
  not_in_queue: "La alerta ya no está en la cola de analistas.",
  not_held: "Tu reserva sobre esta alerta ya no está activa (liberada o vencida a los 30 min).",
};

/* ────────────── helpers ────────────── */

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function stepOutput(detail: AlertDetail | undefined, name: string): Json {
  const step = detail?.steps.filter((s) => s.step_name === name).at(-1);
  return asObject(step?.output);
}

function duration(step: AlertStep): string {
  if (!step.started_at || !step.finished_at) return "—";
  const ms = new Date(step.finished_at).getTime() - new Date(step.started_at).getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function minutesSince(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/* ────────────── tabs ────────────── */

function PlaybookFallbacks({ executor }: { executor: Json }) {
  const fallbacks = (executor.fallbacks as Json[] | undefined) ?? [];
  if (fallbacks.length === 0) return null;
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-warning font-semibold mb-1.5">
        Respaldo aplicado por falta de recursos
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-text-primary">
        <span>
          {DECISION_LABELS[String(executor.decided_action)] ?? String(executor.decided_action)}
        </span>
        {fallbacks.map((f, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <ArrowRight className="h-3 w-3 text-text-secondary" />
            <span>
              {DECISION_LABELS[String(f.to_decision)] ?? String(f.to_decision)}
              {f.to_decision === "block" && executor.block_mode
                ? ` (${String(executor.block_mode)})`
                : ""}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ResumenTab({
  detail,
  schema,
}: {
  detail: AlertDetail;
  schema: AlertSchemaVersion | null;
}) {
  const analyst = stepOutput(detail, "analyst");
  const executor = stepOutput(detail, "executor");
  const classification = Object.keys(stepOutput(detail, "classification")).length
    ? stepOutput(detail, "classification")
    : stepOutput(detail, "detector");
  const profiling = stepOutput(detail, "profiling");
  const playbook = asObject(analyst.playbook);
  const playbookTag = asObject(playbook.resolution).resolution_tag as ResolutionTag | undefined;
  const profiles: [string, unknown][] = [
    ["Perfilamiento usuario", profiling.user_profile],
    ["Perfilamiento transacción", profiling.transaction_profile],
    ["Perfil transaccional (histórico)", profiling.transactional_profile],
  ];
  const amountField = schema?.fields.find((field) => field.id === schema.field_roles.amount);
  const amount = amountField ? detail.input[amountField.field] : undefined;
  const channelField = schema?.fields.find((field) => field.id === schema.field_roles.channel);

  const resolution = detail.analyst_resolution;

  return (
    <div className="max-w-[1180px] space-y-6">
      {resolution && (
        <section
          data-testid="analyst-resolution"
          className="rounded-xl border border-success/40 bg-success/5 px-5 py-4 space-y-1"
        >
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-success">
            <Check className="h-4 w-4" /> Resolución del analista
          </div>
          <p className="text-[14px] font-medium text-text-primary">
            {RESOLUTION_LABELS[resolution.decision] ?? resolution.decision}
          </p>
          <p className="text-[12px] text-text-secondary">
            {resolution.resolved_by_name ?? "Analista"}
            {resolution.resolved_at
              ? ` · ${new Date(resolution.resolved_at).toLocaleString("es-CO")}`
              : ""}
          </p>
          {resolution.notes && (
            <p className="text-[13px] text-text-primary whitespace-pre-wrap pt-1">
              {resolution.notes}
            </p>
          )}
        </section>
      )}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary-light/60 via-primary-light/20 to-transparent p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-[14px] font-bold text-text-primary">Perfilamiento del agente</h2>
          </div>
          {profiles.every(([, text]) => !text) ? (
            <p className="text-[13px] text-text-secondary">
              Sin perfilamiento registrado para esta alerta.
            </p>
          ) : (
            profiles.map(([title, text]) =>
              text ? (
                <div key={title} className="bg-card border border-border rounded-lg px-5 py-4">
                  <div className="text-[11px] uppercase tracking-wider text-text-secondary mb-2">
                    {title}
                  </div>
                  <p className="text-[13px] text-text-primary leading-relaxed whitespace-pre-wrap">
                    {String(text)}
                  </p>
                </div>
              ) : null,
            )
          )}
        </div>

        <div className="lg:sticky lg:top-6 bg-card border-2 border-primary rounded-xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-primary font-bold">
                Decisión del agente:{" "}
                {analyst.decision
                  ? (DECISION_LABELS[String(analyst.decision)] ?? String(analyst.decision))
                  : "—"}
              </div>
              <p className="text-[13px] text-text-primary leading-relaxed">
                {analyst.reasoning ? String(analyst.reasoning) : "El agente aún no decide."}
              </p>
            </div>
          </div>
          <dl className="space-y-1.5 text-[12px]">
            <div className="flex justify-between gap-2">
              <dt className="text-text-secondary">Modus operandi</dt>
              <dd className="font-medium text-text-primary text-right">
                {analyst.modus_operandi_title
                  ? String(analyst.modus_operandi_title)
                  : "Sin playbook"}
              </dd>
            </div>
            {playbookTag && (
              <div className="flex justify-between gap-2">
                <dt className="text-text-secondary">Método del playbook</dt>
                <dd className="font-medium text-text-primary text-right">
                  {RESOLUTION_TAG_LABELS[playbookTag]}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-text-secondary">Acción ejecutada</dt>
              <dd className="font-medium text-text-primary text-right">
                {executor.executed_action
                  ? (DECISION_LABELS[String(executor.executed_action)] ??
                    String(executor.executed_action))
                  : "—"}
              </dd>
            </div>
          </dl>
          {playbook.strategy ? (
            <p className="rounded-lg bg-surface px-3 py-2 text-[12px] text-text-secondary whitespace-pre-wrap">
              {String(playbook.strategy)}
            </p>
          ) : null}
          <PlaybookFallbacks executor={executor} />
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-[12px] uppercase tracking-wider text-text-secondary mb-3">
            Clasificación
          </h3>
          <dl className="space-y-2">
            {[
              ["Fraude", classification.is_fraud],
              ["Clasificación", classification.fraud_classification],
              ["Razonamiento", classification.reasoning],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-3">
                <dt className="text-[12px] text-text-secondary shrink-0">{String(k)}</dt>
                <dd className="text-[12px] font-medium text-text-primary text-right">
                  {v ? String(v) : "—"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-[12px] uppercase tracking-wider text-text-secondary mb-3">
            Datos transacción
          </h3>
          <dl className="space-y-2">
            {[
              ["Evento", detail.event_id],
              ["Tipo", detail.event_type],
              ["Cliente", detail.customer_id ?? "—"],
              ["Monto", amount !== undefined && amount !== null ? String(amount) : "—"],
              ["Canal", channelField ? String(detail.input[channelField.field] ?? "—") : "—"],
              ["Recibida", new Date(detail.created_at).toLocaleString("es-CO")],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-[12px] text-text-secondary">{k}</dt>
                <dd className="text-[12px] font-medium text-text-primary text-right break-all">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}

function RazonamientoTab({
  detail,
  schema,
}: {
  detail: AlertDetail;
  schema: AlertSchemaVersion | null;
}) {
  const stepKey = (step: AlertStep, i: number) => `${step.step_name}-${step.attempt}-${i}`;
  // Opens the analyst's decision by default (the last analyst step).
  const [open, setOpen] = useState<string | null>(() => {
    let key: string | null = null;
    detail.steps.forEach((step, i) => {
      if (step.step_name === "analyst") key = stepKey(step, i);
    });
    return key;
  });
  if (detail.steps.length === 0)
    return <p className="text-[13px] text-text-secondary">El workflow aún no registra pasos.</p>;
  return (
    <div className="space-y-5">
      <AlertFlowDiagrams
        steps={detail.steps}
        status={detail.status}
        decision={String(stepOutput(detail, "analyst").decision ?? stepOutput(detail, "detector_adversarial").decision ?? "") || undefined}
        executedAction={String(stepOutput(detail, "executor").executed_action ?? "") || undefined}
        analystResolved={Boolean(detail.analyst_resolution)}
      />
      {schema && (
        <section className="max-w-[860px] bg-card rounded-xl border border-border p-5">
          <h2 className="text-[14px] font-semibold text-text-primary mb-3">Campos del agente</h2>
          <AlertSchemaView schema={schema} data={detail} mode="aria" alertId={detail.alert_id} />
        </section>
      )}
      <section className="max-w-[860px] bg-card rounded-xl border border-border p-6">
        <h2 className="text-[14px] font-semibold text-text-primary mb-5">
          Línea de tiempo del ciclo
        </h2>
        <ol className="relative">
          {detail.steps.map((step, i) => {
            const key = stepKey(step, i);
            const isOpen = open === key;
            const failed = step.status === "FAILED";
            const running = step.status === "RUNNING";
            return (
              <li key={key} className="relative pl-10 pb-5 last:pb-0">
                {i < detail.steps.length - 1 && (
                  <span className="absolute left-[14px] top-7 bottom-0 w-px bg-border" />
                )}
                <button onClick={() => setOpen(isOpen ? null : key)} className="w-full text-left">
                  <span
                    className={`absolute left-0 top-0 h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2 ${
                      failed
                        ? "border-danger bg-danger text-white"
                        : running
                          ? "border-primary bg-primary-light text-primary"
                          : "border-success bg-success text-white"
                    }`}
                  >
                    {failed ? (
                      <X className="h-3.5 w-3.5" />
                    ) : running ? (
                      i + 1
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-text-primary">
                        {STEP_LABELS[step.step_name] ?? step.step_name}
                        {step.attempt > 1 ? ` (intento ${step.attempt})` : ""}
                      </span>
                      <span className="text-[11px] text-text-secondary">· {duration(step)}</span>
                      <StepLlmBadge output={step.output} />
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-text-secondary transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>
                {isOpen && (
                  <pre className="mt-2 bg-[#0f172a] text-[#94a3b8] text-[11px] rounded-lg p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap font-mono max-h-[420px]">
                    {step.error ?? JSON.stringify(step.output, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function HistorialTab({
  detail,
  schema,
}: {
  detail: AlertDetail;
  schema: AlertSchemaVersion | null;
}) {
  return (
    <div className="max-w-[1180px]">
      <AlertSchemaView schema={schema} data={detail} mode="history" alertId={detail.alert_id} />
    </div>
  );
}

/* ────────────── analyst bar ────────────── */

function ReservationCountdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
  // The reservation is already free server-side: refetch now instead of
  // waiting for the 15 s poll, so the bar and any open modal drop the hold.
  useEffect(() => {
    if (seconds === 0) onExpire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds === 0]);
  return (
    <span className={`tabular-nums ${seconds < 300 ? "text-danger" : "text-text-secondary"}`}>
      Tu reserva vence en {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

const RESOLUTIONS: { decision: AnalystResolution; label: string; tone: string; help: string }[] = [
  {
    decision: "block",
    label: "Confirmar fraude (bloquear)",
    tone: "bg-danger",
    help: "Bloquea la transacción/canal. Las notas viajan como comentario ARIC.",
  },
  {
    decision: "pass",
    label: "Falso positivo (dejar pasar)",
    tone: "bg-success",
    help: "Libera la alerta sin acción.",
  },
  {
    decision: "bidi",
    label: "Enviar a bidi",
    tone: "bg-primary",
    help: "Verificación bidireccional con el cliente.",
  },
];

function ResolveModal({
  alertId,
  decision,
  onClose,
  onResolved,
}: {
  alertId: string;
  decision: AnalystResolution;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [notes, setNotes] = useState("");
  const meta = RESOLUTIONS.find((r) => r.decision === decision)!;
  const mutation = useMutation({
    mutationFn: () => resolveAlert({ data: { alertId, decision, notes: notes.trim() } }),
    onSuccess: onResolved,
  });
  const code = queueConflictCode(mutation.error);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card rounded-xl border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="text-[15px] font-bold text-text-primary">{meta.label}</div>
            <div className="text-[12px] text-text-secondary mt-0.5">{meta.help}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-text-secondary hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-2">
          <label className="text-[11px] uppercase tracking-wider text-text-secondary">
            Notas <span className="normal-case tracking-normal">(mín. 10 caracteres)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="Evidencia revisada y criterio aplicado…"
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {mutation.isError && (
            <p className="text-[12px] text-danger">
              {(code && TAKE_ERRORS[code]) ?? String(mutation.error)}
            </p>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-border text-[13px] font-medium text-text-primary hover:bg-surface"
          >
            Cancelar
          </button>
          <button
            disabled={notes.trim().length < 10 || mutation.isPending}
            onClick={() => mutation.mutate()}
            className={`inline-flex items-center gap-2 h-9 px-4 rounded-lg text-white text-[13px] font-medium ${meta.tone} disabled:opacity-40`}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Resolver
          </button>
        </div>
      </div>
    </div>
  );
}

function DatasetModal({
  alertId,
  schema,
  onClose,
}: {
  alertId: string;
  schema: AlertSchemaVersion | null;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const datasetsQuery = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
  const curateMutation = useMutation({
    mutationFn: () =>
      curateAlertToDataset({ data: { alertId, datasetName, justification: text.trim() } }),
    onSuccess: onClose,
  });
  const disabled = text.trim().length < 20 || !datasetName || curateMutation.isPending;
  const columns = schema?.fields.filter((field) => field.is_alert && !field.is_history) ?? [];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto bg-card rounded-xl border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="text-[15px] font-bold text-text-primary">
            Agregar al dataset de entrenamiento
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-text-secondary hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                  Columnas que llenará
                </p>
                <p className="text-[12px] text-text-secondary mt-1">
                  Entrada y etiquetas de la alerta canónica; no se aplica mapeo de exportación.
                </p>
              </div>
              <span className="shrink-0 text-[12px] font-medium text-text-primary">
                Esquema v{schema?.version ?? "—"}
              </span>
            </div>
            {columns.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {columns.map((field) => (
                  <span
                    key={field.id}
                    className={`rounded-md border px-2 py-1 text-[11px] ${field.is_label ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-card text-text-primary"}`}
                  >
                    {field.field_name || field.field} · {field.is_label ? "etiqueta" : "entrada"}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-text-secondary">
                No hay una versión activa del esquema con campos para exportar.
              </p>
            )}
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-text-secondary">
              Dataset destino
            </label>
            {datasetsQuery.isLoading && (
              <p className="mt-2 text-[12px] text-text-secondary">Cargando datasets…</p>
            )}
            {datasetsQuery.isError && (
              <p className="mt-2 text-[12px] text-danger">No se pudieron cargar los datasets.</p>
            )}
            {datasetsQuery.isSuccess && (
              <select
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                className="mt-2 w-full h-9 rounded-md border border-border px-3 text-[13px] bg-background"
              >
                <option value="">Selecciona un dataset…</option>
                {datasetsQuery.data.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name} ({d.row_count} filas)
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-text-secondary">
              Justificación{" "}
              <span className="text-danger normal-case tracking-normal">(mín. 20 caracteres)</span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {curateMutation.isError && (
            <p className="text-[12px] text-danger">{(curateMutation.error as Error).message}</p>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-border text-[13px] font-medium text-text-primary hover:bg-surface"
          >
            Cancelar
          </button>
          <button
            disabled={disabled}
            onClick={() => curateMutation.mutate()}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-40"
          >
            {curateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

function AnalystBar({
  detail,
  schema,
  onChanged,
}: {
  detail: AlertDetail;
  schema: AlertSchemaVersion | null;
  onChanged: () => void;
}) {
  const { user, role } = useRole();
  const navigate = useNavigate();
  const [resolving, setResolving] = useState<AnalystResolution | null>(null);
  const [showDataset, setShowDataset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reservation = detail.reservation;
  const mine = !!reservation && reservation.holder === user?.id;
  const isFraudAnalyst = role === "fraud_analyst";
  const onError = (e: unknown) => {
    setError(TAKE_ERRORS[queueConflictCode(e) ?? ""] ?? String(e));
    onChanged();
  };
  const take = useMutation({
    mutationFn: () => takeAlert({ data: { alertId: detail.alert_id } }),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError,
  });
  const release = useMutation({
    mutationFn: () => releaseAlert({ data: { alertId: detail.alert_id } }),
    onSuccess: () => navigate({ to: "/cola" }),
    onError,
  });

  // Losing the hold (expired, released elsewhere) closes the resolve modal.
  useEffect(() => {
    if (!mine) setResolving(null);
  }, [mine]);

  let status: ReactNode = null;
  let actions: ReactNode = null;
  if (detail.status === "CLOSED" && detail.analyst_resolution) {
    const closed = detail.analyst_resolution;
    status = (
      <span className="text-text-secondary">
        Cerrada por {closed.resolved_by_name ?? "un analista"} ·{" "}
        {RESOLUTION_LABELS[closed.decision] ?? closed.decision}
      </span>
    );
  } else if (detail.status !== "ESCALATED") {
    status = (
      <span className="text-text-secondary">Esta alerta no está esperando a un analista.</span>
    );
  } else if (mine) {
    status = <ReservationCountdown expiresAt={reservation!.expires_at} onExpire={onChanged} />;
    actions = (
      <>
        {RESOLUTIONS.map((r) => (
          <button
            key={r.decision}
            onClick={() => setResolving(r.decision)}
            className={`h-9 px-4 rounded-md text-white text-[13px] font-medium hover:opacity-90 ${r.tone}`}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={() => release.mutate()}
          disabled={release.isPending}
          className="h-9 px-4 rounded-md border border-border text-text-primary text-[13px] font-medium hover:bg-surface"
        >
          Liberar
        </button>
      </>
    );
  } else if (reservation) {
    status = (
      <span className="inline-flex items-center gap-1.5 text-text-secondary">
        <Lock className="h-3.5 w-3.5" /> Atendida por {reservation.holder_name ?? "otro analista"} ·
        solo lectura
      </span>
    );
  } else if (isFraudAnalyst) {
    status = <span className="text-text-secondary">Sin tomar.</span>;
    actions = (
      <button
        onClick={() => take.mutate()}
        disabled={take.isPending}
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90"
      >
        {take.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Tomar caso
      </button>
    );
  } else {
    status = (
      <span className="text-text-secondary">
        Sin tomar · solo los analistas de fraude pueden tomarla.
      </span>
    );
  }

  return (
    <>
      <div className="fixed bottom-0 left-[220px] right-0 bg-card border-t border-border px-8 py-3 flex items-center justify-between gap-3 z-10 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3 flex-wrap text-[12px]">
          {status}
          {error && (
            <span className="inline-flex items-center gap-1.5 text-danger">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {actions}
          <button
            onClick={() => setShowDataset(true)}
            className="h-9 px-4 rounded-md border border-primary text-primary text-[13px] font-medium hover:bg-primary-light inline-flex items-center gap-1.5"
          >
            <Database className="h-3.5 w-3.5" /> Al dataset
          </button>
        </div>
      </div>
      {resolving && (
        <ResolveModal
          alertId={detail.alert_id}
          decision={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => navigate({ to: "/cola" })}
        />
      )}
      {showDataset && (
        <DatasetModal
          alertId={detail.alert_id}
          schema={schema}
          onClose={() => setShowDataset(false)}
        />
      )}
    </>
  );
}

/* ────────────── page ────────────── */

function AlertaDetailPage() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<AlertTab>("resumen");
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ["alertDetail", id],
    queryFn: () => getAlertDetail({ data: { alertId: id } }),
    refetchInterval: 15_000,
  });
  const schemaVersion = detailQuery.data?.schema_version;
  const schemaQuery = useQuery({
    queryKey: ["alertSchema", schemaVersion ?? "active"],
    queryFn: () =>
      schemaVersion === null || schemaVersion === undefined
        ? getActiveAlertSchema()
        : getAlertSchemaVersion(schemaVersion),
    enabled: Boolean(detailQuery.data),
  });
  const { role, user } = useRole();
  const canReadQuality = Boolean(user?.permissions.includes("monitor"));
  const canReadRaw = role === "manager" || role === "release_manager";
  const rawQuery = useQuery({
    queryKey: ["alertRaw", id],
    queryFn: () => getAlertRaw({ data: { alertId: id } }),
    enabled: canReadRaw && tab === "raw",
  });
  const detail = detailQuery.data;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["alertDetail", id] });
    void queryClient.invalidateQueries({ queryKey: ["analystQueue"] });
  };
  const status = ALERT_STATUS[detail?.status ?? ""] ?? ALERT_STATUS.RECEIVED;
  const schema = schemaQuery.data ?? null;
  const missingFields =
    schema?.fields.filter((field) => field.is_mandatory && detail?.input[field.field] == null) ??
    [];

  return (
    <DashboardLayout>
      <div className="p-8 pb-24">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <nav className="flex items-center gap-1.5 text-[12px] text-text-secondary mb-2">
              <Link to="/cola" className="hover:text-primary">
                Alertas en progreso
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-text-primary font-medium">Alerta #{id.slice(0, 8)}</span>
            </nav>
            <h1 className="text-[20px] font-semibold text-text-primary">
              Alerta #{id.slice(0, 8)}
            </h1>
          </div>
          {detail && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-text-secondary">
                Esquema v{detail.schema_version ?? schema?.version ?? "—"} · Config{" "}
                {detail.configuration_ref?.configuration_id ?? "—"} v
                {detail.configuration_ref?.version ?? "—"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold ${status.className}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {status.label}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary">
                <Clock className="h-3.5 w-3.5" />
                {minutesSince(detail.created_at)} en sistema
              </span>
              <button
                onClick={refresh}
                className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary border border-border rounded-md px-2 py-1 hover:text-text-primary"
                title="Actualizar"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${detailQuery.isFetching ? "animate-spin" : ""}`}
                />
                Actualizar
              </button>
            </div>
          )}
        </div>

        {detailQuery.isLoading && (
          <p className="text-[13px] text-text-secondary">
            <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
            Cargando alerta…
          </p>
        )}
        {detailQuery.isError && (
          <p className="text-[13px] text-danger">
            No se pudo cargar la alerta: {String(detailQuery.error)}
          </p>
        )}

        {detail && (
          <>
            {detail.status === "ESCALATED" && missingFields.length > 0 && (
              <div className="mb-4 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-[12px] text-text-primary">
                <strong>Campos faltantes del esquema:</strong>{" "}
                {missingFields.map((field) => field.field_name || field.field).join(", ")}
              </div>
            )}
            <div className="flex gap-1 border-b border-border mb-6">
              {[
                ...TABS,
                ...(canReadQuality
                  ? [{ id: "calidad" as const, label: "Evaluación de calidad" }]
                  : []),
                ...(canReadRaw ? [{ id: "raw" as const, label: "Evento original (ARIC)" }] : []),
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                    tab === t.id
                      ? "border-primary text-primary"
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === "resumen" && <ResumenTab detail={detail} schema={schema} />}
            {tab === "razonamiento" && <RazonamientoTab detail={detail} schema={schema} />}
            {tab === "calidad" && canReadQuality && (
              <ReasoningEvaluationTab
                alertId={detail.alert_id}
                canRequest={Boolean(user?.permissions.includes("configuration"))}
              />
            )}
            {tab === "data" && (
              <div className="max-w-[860px]">
                <AlertSchemaView
                  schema={schema}
                  data={detail}
                  alertId={detail.alert_id}
                  canReport={role === "fraud_analyst" || role === "ops_analyst"}
                />
              </div>
            )}
            {tab === "usuario" && (
              <div className="max-w-[860px]">
                <AlertSchemaView
                  schema={schema}
                  data={detail}
                  mode="user"
                  alertId={detail.alert_id}
                  canReport={role === "fraud_analyst" || role === "ops_analyst"}
                />
              </div>
            )}
            {tab === "historial" && <HistorialTab detail={detail} schema={schema} />}
            {tab === "raw" && (
              <div className="max-w-[1180px] rounded-xl bg-[#0f172a] text-[#cbd5e1] p-4 overflow-auto">
                <pre className="text-[11px] whitespace-pre-wrap">
                  {rawQuery.isLoading
                    ? "Cargando evento original…"
                    : JSON.stringify(rawQuery.data, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
      {detail && <AnalystBar detail={detail} schema={schema} onChanged={refresh} />}
    </DashboardLayout>
  );
}
