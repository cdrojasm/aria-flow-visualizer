import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  resolveAgentBlock,
  type AgentApprovalKind,
  type AgentSession,
  type AgentSessionOverview,
} from "@/lib/api/agent.functions";
import { BLOCK_ERROR_COPY, BUDGET_RESOURCE_LABEL, budgetLabel } from "./labels";

const ALLOWANCES = [1, 3, 5, 10, 20];

function errorMessage(error: unknown) {
  // apiFetch errors read `path -> status: {"detail":{"code":"..."}}`.
  const message = error instanceof Error ? error.message : "";
  const code = /"code"\s*:\s*"([A-Z_]+)"/.exec(message)?.[1] ?? "";
  return BLOCK_ERROR_COPY[code] ?? "No se pudo registrar la aprobación. Inténtalo de nuevo.";
}

/** Grant exactly what the blocked session is waiting for, in the shared side drawer. */
export function BlockApprovalDrawer({
  open,
  onOpenChange,
  session,
  overview,
  spent,
  onResolved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: AgentSession;
  overview: AgentSessionOverview;
  spent: Record<string, number>;
  onResolved: (session: AgentSession) => void;
}) {
  const approval = overview.verdict.approval as AgentApprovalKind | null;
  const [tokens, setTokens] = useState("");
  const [usd, setUsd] = useState("");
  const [minutes, setMinutes] = useState("");
  const [allowance, setAllowance] = useState(5);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      if (approval === "budget") {
        const additions: Record<string, number> = {};
        if (Number(tokens) > 0) additions.tokens = Math.round(Number(tokens));
        if (Number(usd) > 0) additions.usd_micros = Math.round(Number(usd) * 1_000_000);
        if (Number(minutes) > 0) additions.seconds = Math.round(Number(minutes) * 60);
        return resolveAgentBlock(session.session_id, { kind: "budget", additions });
      }
      if (approval === "candidates") {
        return resolveAgentBlock(session.session_id, { kind: "candidates", allowance });
      }
      return resolveAgentBlock(session.session_id, { kind: "context", note: note.trim() });
    },
    onSuccess: (updated) => {
      setError("");
      setTokens("");
      setUsd("");
      setMinutes("");
      setNote("");
      onResolved(updated);
      onOpenChange(false);
    },
    onError: (failure) => setError(errorMessage(failure)),
  });

  const canSubmit =
    approval === "budget"
      ? Number(tokens) > 0 || Number(usd) > 0 || Number(minutes) > 0
      : approval === "context"
        ? note.trim().length > 0
        : approval === "candidates";
  const dirty = Boolean(tokens || usd || minutes || note);
  const title =
    approval === "budget"
      ? "Aprobar más presupuesto"
      : approval === "candidates"
        ? "Aprobar más iteraciones"
        : "Dar contexto al agente";

  return (
    <SideDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={overview.verdict.title}
      dirty={dirty}
      footer={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border px-3 py-2 text-[12px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {mutation.isPending ? "Aprobando…" : "Aprobar y continuar"}
          </button>
        </>
      }
    >
      <p className="text-[13px] text-text-secondary">{overview.verdict.detail}</p>

      {approval === "budget" && (
        <>
          <dl className="grid grid-cols-3 gap-2 text-[12px]">
            {Object.entries(session.budget_limits).map(([resource, limit]) => (
              <div key={resource} className="rounded-lg border border-border p-2">
                <dt className="text-text-secondary">
                  {BUDGET_RESOURCE_LABEL[resource] ?? resource}
                </dt>
                <dd className="font-medium text-text-primary">
                  {budgetLabel(resource, spent[resource] ?? 0)} de {budgetLabel(resource, limit)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-[12px] text-text-secondary">
            Indica cuánto sumar a cada recurso. Nunca podrá superar el tope global por sesión.
          </p>
          <div className="grid gap-3">
            <label className="text-[12px] text-text-secondary">
              Tokens a sumar
              <input
                aria-label="Tokens a sumar"
                type="number"
                min={0}
                value={tokens}
                onChange={(event) => setTokens(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary"
              />
            </label>
            <label className="text-[12px] text-text-secondary">
              Costo a sumar (USD)
              <input
                aria-label="Costo a sumar en USD"
                type="number"
                min={0}
                step="0.5"
                value={usd}
                onChange={(event) => setUsd(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary"
              />
            </label>
            <label className="text-[12px] text-text-secondary">
              Tiempo a sumar (minutos)
              <input
                aria-label="Minutos a sumar"
                type="number"
                min={0}
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary"
              />
            </label>
          </div>
        </>
      )}

      {approval === "candidates" && (
        <label className="block text-[12px] text-text-secondary">
          Iteraciones adicionales
          <select
            aria-label="Iteraciones adicionales"
            value={allowance}
            onChange={(event) => setAllowance(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary"
          >
            {ALLOWANCES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span className="mt-1 block">
            La cuenta de iteraciones sin mejora vuelve a empezar desde ahora.
          </span>
        </label>
      )}

      {approval === "context" && (
        <label className="block text-[12px] text-text-secondary">
          Pista, restricción o hipótesis para el agente
          <textarea
            aria-label="Contexto para el agente"
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ej.: revisa si las alertas de Digital en la noche generan más falsos positivos."
            className="mt-1 min-h-28 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary"
          />
          <span className="mt-1 block">
            {note.length}/1.000 · No incluyas datos personales: se rechazan.
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-2 text-[12px] text-danger">
          {error}
        </p>
      )}
    </SideDrawer>
  );
}
