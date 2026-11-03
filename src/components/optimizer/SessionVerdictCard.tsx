import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  HelpCircle,
  Loader2,
  OctagonX,
  Pause,
  Play,
  Square,
  XCircle,
} from "lucide-react";
import type { AgentSession, AgentSessionOverview } from "@/lib/api/agent.functions";
import { ageLabel, TONE_CLASS, VERDICT_META } from "./labels";

const ICON = {
  draft: CircleDashed,
  running: Loader2,
  stalled: AlertTriangle,
  failing: XCircle,
  blocked: HelpCircle,
  paused: Pause,
  completed: CheckCircle2,
  inconclusive: HelpCircle,
  stopped: OctagonX,
  failed: XCircle,
  cancelled: OctagonX,
} as const;

const APPROVAL_LABEL = {
  budget: "Aprobar más presupuesto",
  candidates: "Aprobar más iteraciones",
  context: "Dar contexto",
} as const;

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "STOPPED"]);

/** The answer to "is it working, did it fail, what do you need from me?". */
export function SessionVerdictCard({
  session,
  overview,
  canApprove,
  busy,
  onControl,
  onApprove,
}: {
  session: AgentSession;
  overview: AgentSessionOverview;
  canApprove: boolean;
  busy: boolean;
  onControl: (action: "pause" | "resume" | "cancel") => void;
  onApprove: () => void;
}) {
  const { verdict, health } = overview;
  const meta = VERDICT_META[verdict.state];
  const Icon = ICON[verdict.state];
  const active = session.status === "ACTIVE";
  const canResume = session.status === "PAUSED";
  const canCancel = !TERMINAL.has(session.status) && session.status !== "DRAFT";
  return (
    <section
      aria-label="Estado del optimizador"
      data-testid="optimizer-verdict"
      data-state={verdict.state}
      className={`rounded-xl border p-4 ${TONE_CLASS[meta.tone]}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Icon
            aria-hidden="true"
            className={`mt-0.5 h-5 w-5 shrink-0 ${verdict.state === "running" ? "animate-spin" : ""}`}
          />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
              {meta.label}
            </p>
            <h2 className="text-[16px] font-bold text-text-primary">{verdict.title}</h2>
            <p className="mt-0.5 text-[13px] text-text-secondary">{verdict.detail}</p>
            {verdict.action && (
              <p className="mt-1 text-[13px] font-medium text-text-primary">{verdict.action}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {verdict.approval && canApprove && (
            <button
              type="button"
              onClick={onApprove}
              className="rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-white hover:bg-primary/90"
            >
              {APPROVAL_LABEL[verdict.approval]}
            </button>
          )}
          {canResume && (
            <button
              type="button"
              aria-label="Reanudar optimizador"
              disabled={busy}
              onClick={() => onControl("resume")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-medium text-text-primary disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" /> Reanudar
            </button>
          )}
          {active && (
            <button
              type="button"
              aria-label="Pausar optimizador"
              disabled={busy}
              onClick={() => onControl("pause")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-medium text-text-primary disabled:opacity-50"
            >
              <Pause className="h-3.5 w-3.5" aria-hidden="true" /> Pausar
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              aria-label="Cancelar optimizador"
              disabled={busy}
              onClick={() => onControl("cancel")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-medium text-text-primary disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" aria-hidden="true" /> Cancelar
            </button>
          )}
        </div>
      </div>
      {verdict.approval && !canApprove && (
        <p className="mt-3 text-[12px] text-text-secondary">
          Solo el Channel Manager puede aprobar lo que el agente necesita.
        </p>
      )}
      <p
        className="mt-3 border-t border-current/10 pt-2 text-[11px] text-text-secondary"
        data-testid="optimizer-health"
      >
        Último evento {ageLabel(health.seconds_since_last_event)} · Reserva de ejecución:{" "}
        {health.lease === "ACTIVE" ? "activa" : health.lease === "EXPIRED" ? "vencida" : "ninguna"}
        {health.stalled && " · el sistema la recuperará automáticamente"}
      </p>
    </section>
  );
}
