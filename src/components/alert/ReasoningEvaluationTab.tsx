import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  formatDuration,
  getAlertReasoningEvaluation,
  requestAlertReasoningEvaluation,
  STATE_EXPLANATIONS,
  STATE_LABELS,
  type ApiAlertReasoningEvaluation,
  type ApiEvaluationJob,
  type ApiReasoningEvaluation,
} from "@/lib/api/reasoningEvaluation.functions";
import { STEP_LABELS } from "@/lib/alertSteps";

/* What the LLM-judge concluded about an alert's reasoning: whether any step
   stated something the evidence does not support (alucinación), whether the data
   was used correctly (per step) and the explainability criteria of the whole.

   The evaluator is its own flow: the alert is resolved and visible whatever the
   evaluator does. This tab shows the evaluator's own state (queued, running,
   failed) and how long it took, and lets who may spend an LLM call ask for it. */

export function VerdictBadge({
  ok,
  okLabel,
  badLabel,
}: {
  ok: boolean | null;
  okLabel: string;
  badLabel: string;
}) {
  if (ok === null) return <span className="text-[12px] text-text-secondary">—</span>;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ok ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
    >
      {ok ? okLabel : badLabel}
    </span>
  );
}

const ACTIVE = new Set(["queued", "running"]);

export function ReasoningEvaluationTab({
  alertId,
  canRequest = false,
}: {
  alertId: string;
  canRequest?: boolean;
}) {
  const queryClient = useQueryClient();
  const key = ["alertReasoningEvaluation", alertId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getAlertReasoningEvaluation(alertId),
    retry: false,
    // While the evaluator works on it, look again: nothing else tells us it ended.
    refetchInterval: (current) => (ACTIVE.has(current.state.data?.state ?? "") ? 3_000 : false),
  });
  const request = useMutation({
    mutationFn: () => requestAlertReasoningEvaluation(alertId),
    onSuccess: (data) => queryClient.setQueryData<ApiAlertReasoningEvaluation>(key, data),
  });
  if (query.isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (query.isError || !query.data) {
    return (
      <p role="alert" className="text-[13px] text-danger">
        No se pudo cargar la evaluación de calidad.
      </p>
    );
  }
  const { state, evaluation, job } = query.data;
  const canAsk = canRequest && ["not_sampled", "failed", "invalid"].includes(state);
  return (
    <div className="max-w-[860px] space-y-4">
      {evaluation ? (
        <EvaluationDetail evaluation={evaluation} />
      ) : (
        <section className="space-y-2 rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
            {ACTIVE.has(state) && <Loader2 className="h-4 w-4 animate-spin" />}
            {STATE_LABELS[state]}
          </h2>
          <p className="text-[13px] text-text-secondary">{STATE_EXPLANATIONS[state]}</p>
        </section>
      )}
      {job && <JobTimings job={job} />}
      {canAsk && (
        <div className="space-y-1">
          <button
            type="button"
            disabled={request.isPending}
            onClick={() => request.mutate()}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-primary disabled:opacity-50"
          >
            {state === "not_sampled" ? "Evaluar ahora" : "Volver a evaluar"}
          </button>
          {request.isError && (
            <p role="alert" className="text-[12px] text-danger">
              No se pudo pedir la evaluación.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function JobTimings({ job }: { job: ApiEvaluationJob }) {
  const done = job.total_ms !== null;
  return (
    <p className="text-[11px] text-text-secondary" data-testid="evaluation-timings">
      Evaluación {job.requested_by === "manual" ? "pedida a mano" : "por muestreo"}
      {done
        ? ` · tardó ${formatDuration(job.total_ms)} en total (${formatDuration(job.wait_ms)} en cola + ${formatDuration(job.run_ms)} evaluando)`
        : job.wait_ms !== null
          ? ` · esperó ${formatDuration(job.wait_ms)} en cola`
          : ""}
      {job.attempts > 1 ? ` · ${job.attempts} ejecuciones` : ""}
    </p>
  );
}

export function EvaluationDetail({ evaluation }: { evaluation: ApiReasoningEvaluation }) {
  const invalid = evaluation.status === "invalid";
  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[14px] font-semibold text-text-primary">Veredicto del evaluador</h2>
          {invalid ? (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
              Evaluación inválida
            </span>
          ) : (
            <>
              <VerdictBadge
                ok={evaluation.hallucination === null ? null : !evaluation.hallucination}
                okLabel="Sin alucinaciones"
                badLabel="Alucinación"
              />
              <VerdictBadge
                ok={evaluation.data_use_correct}
                okLabel="Uso correcto de datos"
                badLabel="Uso incorrecto de datos"
              />
            </>
          )}
        </div>
        <p className="whitespace-pre-wrap text-[13px] text-text-primary">
          {evaluation.rationale || "El evaluador no dejó justificación."}
        </p>
        <p className="text-[11px] text-text-secondary">
          Modelo {evaluation.judge_model} · prompt {evaluation.prompt_version} ·{" "}
          {evaluation.attempts > 1 ? `${evaluation.attempts} intentos · ` : ""}
          {evaluation.input_tokens + evaluation.output_tokens} tokens · el modelo tardó{" "}
          {formatDuration(evaluation.duration_ms)} · evaluada el{" "}
          {evaluation.evaluated_at.slice(0, 10)}
        </p>
      </section>
      {evaluation.criteria.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-2 text-[13px] font-semibold text-text-primary">Explicabilidad</h3>
          <ul className="divide-y divide-border">
            {evaluation.criteria.map((criterion) => (
              <li key={criterion.key} className="space-y-1 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-text-primary">
                    {criterion.label}
                  </span>
                  {criterion.passed === null ? (
                    <span className="rounded-full bg-border/60 px-2 py-0.5 text-[11px] text-text-secondary">
                      No se pudo decidir
                    </span>
                  ) : (
                    <VerdictBadge ok={criterion.passed} okLabel="Cumple" badLabel="No cumple" />
                  )}
                </div>
                {criterion.note && (
                  <p className="text-[12px] text-text-secondary">{criterion.note}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {evaluation.steps.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-2 text-[13px] font-semibold text-text-primary">Por paso</h3>
          <ul className="divide-y divide-border">
            {evaluation.steps.map((step) => (
              <li key={step.step} className="space-y-1 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-text-primary">
                    {STEP_LABELS[step.step] ?? step.step}
                  </span>
                  <VerdictBadge
                    ok={!step.hallucination}
                    okLabel="Sin alucinación"
                    badLabel="Alucinación"
                  />
                  <VerdictBadge
                    ok={step.data_use_correct}
                    okLabel="Datos bien usados"
                    badLabel="Datos mal usados"
                  />
                </div>
                {step.note && <p className="text-[12px] text-text-secondary">{step.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        !invalid && (
          <p className="text-[12px] text-text-secondary">
            Este veredicto es anterior al detalle por paso: solo hay conclusión global.
          </p>
        )
      )}
    </div>
  );
}
