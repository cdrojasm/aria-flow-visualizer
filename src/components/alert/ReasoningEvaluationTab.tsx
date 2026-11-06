import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  getAlertReasoningEvaluation,
  STATE_EXPLANATIONS,
  STATE_LABELS,
  type ApiReasoningEvaluation,
} from "@/lib/api/reasoningEvaluation.functions";
import { STEP_LABELS } from "@/lib/alertSteps";

/* What the LLM-judge concluded about an alert's reasoning: whether any step
   stated something the evidence does not support (alucinación) and whether the
   data was used correctly, per step when the judge gave that detail. */

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

export function ReasoningEvaluationTab({ alertId }: { alertId: string }) {
  const query = useQuery({
    queryKey: ["alertReasoningEvaluation", alertId],
    queryFn: () => getAlertReasoningEvaluation(alertId),
    retry: false,
  });
  if (query.isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (query.isError || !query.data) {
    return (
      <p role="alert" className="text-[13px] text-danger">
        No se pudo cargar la evaluación de calidad.
      </p>
    );
  }
  const { state, evaluation } = query.data;
  if (!evaluation) {
    return (
      <section className="max-w-[860px] space-y-1 rounded-xl border border-border bg-card p-5">
        <h2 className="text-[14px] font-semibold text-text-primary">{STATE_LABELS[state]}</h2>
        <p className="text-[13px] text-text-secondary">{STATE_EXPLANATIONS[state]}</p>
      </section>
    );
  }
  return <EvaluationDetail evaluation={evaluation} />;
}

export function EvaluationDetail({ evaluation }: { evaluation: ApiReasoningEvaluation }) {
  const invalid = evaluation.status === "invalid";
  return (
    <div className="max-w-[860px] space-y-4">
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
          {evaluation.input_tokens + evaluation.output_tokens} tokens · evaluada el{" "}
          {evaluation.evaluated_at.slice(0, 10)}
        </p>
      </section>
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
