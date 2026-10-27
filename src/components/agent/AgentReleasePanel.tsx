import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRetrospectiveValidation,
  listAgentReleases,
  requestAgentRelease,
  transitionAgentRelease,
  validateAgentExperiment,
  type AgentRelease,
  type RetrospectiveValidation,
} from "@/lib/api/agent.functions";

type Role = "manager" | "release_manager" | "channel_manager" | string | undefined;

export function AgentReleasePanel({ role }: { role: Role }) {
  const queryClient = useQueryClient();
  const canRequest = role === "channel_manager";
  const canApprove = role === "manager" || role === "release_manager";
  const [sessionId, setSessionId] = useState("");
  const [experimentId, setExperimentId] = useState("");
  const [validation, setValidation] = useState<RetrospectiveValidation | null>(null);
  const [createdRelease, setCreatedRelease] = useState<AgentRelease | null>(null);
  const [title, setTitle] = useState("Promoción de experimento evaluado");
  const [reason, setReason] = useState("Experimento evaluado y revisado por el channel manager.");
  const [transitionReason, setTransitionReason] = useState("Revisión de guardrail completada.");
  const [notice, setNotice] = useState("");
  const releasesQuery = useQuery({
    queryKey: ["agentReleases"],
    queryFn: listAgentReleases,
    enabled: canApprove,
    refetchInterval: 5_000,
  });
  const validationMutation = useMutation({
    mutationFn: () => validateAgentExperiment(sessionId.trim(), experimentId.trim()),
    onSuccess: (result) => {
      setValidation(result);
      setNotice(
        result.status === "RUNNING"
          ? "Validación en curso: el worker reproduce el pipeline real con la muestra final."
          : `Validación retrospectiva: ${result.status}`,
      );
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "No se pudo validar."),
  });
  // The replay runs in the worker; poll until it leaves RUNNING.
  useQuery({
    queryKey: ["retrospectiveValidation", validation?.validation_id],
    queryFn: async () => {
      const latest = await getRetrospectiveValidation(validation!.validation_id);
      if (latest.status !== "RUNNING") {
        setValidation(latest);
        setNotice(
          latest.status === "PASSED"
            ? "Validación retrospectiva: PASSED"
            : `Validación retrospectiva: ${latest.status}${latest.error_code ? ` · ${latest.error_code}` : ""}`,
        );
      }
      return latest;
    },
    enabled: validation?.status === "RUNNING",
    refetchInterval: 3_000,
  });
  const requestMutation = useMutation({
    mutationFn: () => {
      if (!validation) throw new Error("VALIDATION_REQUIRED");
      return requestAgentRelease({ validation_id: validation.validation_id, title, reason });
    },
    onSuccess: async (release) => {
      setCreatedRelease(release);
      setNotice(`Release creado en estado ${release.status}.`);
      await queryClient.invalidateQueries({ queryKey: ["agentReleases"] });
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "No se pudo crear el release."),
  });
  const transitionMutation = useMutation({
    mutationFn: ({
      release,
      action,
      targetStage,
    }: {
      release: AgentRelease;
      action: "submit" | "approve" | "advance" | "rollback";
      targetStage?: string;
    }) =>
      transitionAgentRelease(release.release_id, action, {
        expected_version: release.version,
        reason: transitionReason,
        ...(targetStage ? { target_stage: targetStage } : {}),
      }),
    onSuccess: async (release) => {
      setCreatedRelease(release);
      setNotice(`Release actualizado: ${release.status}.`);
      await queryClient.invalidateQueries({ queryKey: ["agentReleases"] });
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "No se pudo cambiar el release."),
  });

  return (
    <section className="border-b border-border p-4" aria-label="Liberación de experimentos">
      <h2 className="text-sm font-semibold">Liberación de experimentos</h2>
      {canRequest && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs" htmlFor="release-session">
            Sesión evaluada
          </label>
          <input
            id="release-session"
            className="w-full rounded border border-border bg-background p-2 text-xs"
            value={sessionId}
            onChange={(event) => {
              setSessionId(event.target.value);
              setValidation(null);
            }}
            placeholder="UUID de sesión"
          />
          <label className="block text-xs" htmlFor="release-experiment">
            Experimento evaluado
          </label>
          <input
            id="release-experiment"
            className="w-full rounded border border-border bg-background p-2 text-xs"
            value={experimentId}
            onChange={(event) => {
              setExperimentId(event.target.value);
              setValidation(null);
            }}
            placeholder="UUID de experimento"
          />
          <button
            type="button"
            className="rounded border border-border px-3 py-2 text-xs disabled:opacity-50"
            disabled={!sessionId.trim() || !experimentId.trim() || validationMutation.isPending}
            onClick={() => validationMutation.mutate()}
          >
            Validar retrospectivamente
          </button>
          {validation && (
            <div role="status" className="rounded border border-border p-2 text-xs">
              <p>
                {validation.status} · snapshot {validation.snapshot_id}
              </p>
              <p>SHA-256: {validation.snapshot_sha256}</p>
              <p>Pins candidatos: {validation.component_pins.length}</p>
            </div>
          )}
          {validation?.status === "PASSED" && (
            <>
              <label className="block text-xs" htmlFor="release-title">
                Título del release
              </label>
              <input
                id="release-title"
                className="w-full rounded border border-border bg-background p-2 text-xs"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <label className="block text-xs" htmlFor="release-reason">
                Motivo
              </label>
              <textarea
                id="release-reason"
                className="w-full rounded border border-border bg-background p-2 text-xs"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <button
                type="button"
                className="rounded bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                disabled={requestMutation.isPending}
                onClick={() => requestMutation.mutate()}
              >
                Crear en SHADOW
              </button>
            </>
          )}
        </div>
      )}
      {canRequest && createdRelease && (
        <article className="mt-3 rounded border border-border p-2 text-xs">
          <p className="font-semibold">Release · {createdRelease.status}</p>
          <p>{createdRelease.release_id}</p>
          <p>El servidor comprobará 30 observaciones reales y el límite de desacuerdo.</p>
          <button
            type="button"
            className="mt-2 rounded border border-border px-2 py-1 disabled:opacity-50"
            disabled={transitionMutation.isPending}
            onClick={() => transitionMutation.mutate({ release: createdRelease, action: "submit" })}
          >
            Enviar a aprobación
          </button>
          {!["ROLLED_BACK", "REJECTED", "FAILED"].includes(createdRelease.status) && (
            <button
              type="button"
              className="ml-2 mt-2 rounded border border-border px-2 py-1"
              onClick={() =>
                transitionMutation.mutate({ release: createdRelease, action: "rollback" })
              }
            >
              Rollback
            </button>
          )}
        </article>
      )}
      {canApprove && (
        <div className="mt-3 space-y-3">
          <label className="block text-xs" htmlFor="release-transition-reason">
            Motivo de transición
          </label>
          <input
            id="release-transition-reason"
            className="w-full rounded border border-border bg-background p-2 text-xs"
            value={transitionReason}
            onChange={(event) => setTransitionReason(event.target.value)}
          />
          {(releasesQuery.data ?? []).map((release) => {
            const observations = release.observations?.count ?? 0;
            const stage =
              release.status === "CANARY_5"
                ? "CANARY_25"
                : release.status === "CANARY_25"
                  ? "CANARY_50"
                  : release.status === "CANARY_50"
                    ? "FULL"
                    : undefined;
            return (
              <article
                key={release.release_id}
                className="rounded border border-border p-2 text-xs"
              >
                <p className="font-semibold">
                  {release.title} · {release.status}
                </p>
                <p>
                  Solicitante: {release.requested_by} ·{" "}
                  {new Date(release.requested_at).toLocaleString("es-CO")}
                </p>
                <p>
                  Observaciones: {observations}/30 · desacuerdos:{" "}
                  {release.observations?.disagreements ?? 0}
                </p>
                <p>
                  Snapshot {release.snapshot_id} · {release.snapshot_sha256}
                </p>
                {Object.keys(release.handoffs ?? {}).length > 0 && (
                  <ul className="mt-1 space-y-0.5" aria-label="Componentes entregados">
                    {Object.entries(release.handoffs ?? {}).map(([component, handoff]) => (
                      <li key={component} data-testid="release-handoff">
                        {HANDOFF_COMPONENT[component] ?? component}:{" "}
                        {HANDOFF_FLOW[handoff.flow] ?? handoff.flow} ·{" "}
                        {HANDOFF_STATUS[handoff.status] ?? handoff.status}
                      </li>
                    ))}
                  </ul>
                )}
                {release.status === "PENDING_APPROVAL" && (
                  <button
                    type="button"
                    className="mt-2 rounded bg-primary px-2 py-1 text-white"
                    onClick={() => transitionMutation.mutate({ release, action: "approve" })}
                  >
                    Aprobar · manager
                  </button>
                )}
                {stage && (
                  <button
                    type="button"
                    className="mt-2 rounded border border-border px-2 py-1 disabled:opacity-50"
                    disabled={observations < 30}
                    onClick={() =>
                      transitionMutation.mutate({ release, action: "advance", targetStage: stage })
                    }
                  >
                    Avanzar a {stage}
                  </button>
                )}
                {!["ROLLED_BACK", "REJECTED", "FAILED"].includes(release.status) && (
                  <button
                    type="button"
                    className="ml-2 mt-2 rounded border border-border px-2 py-1"
                    onClick={() => transitionMutation.mutate({ release, action: "rollback" })}
                  >
                    Rollback
                  </button>
                )}
              </article>
            );
          })}
          {(releasesQuery.data ?? []).length === 0 && (
            <p className="text-xs text-text-secondary">No hay releases registrados.</p>
          )}
        </div>
      )}
      {notice && (
        <p role="alert" className="mt-2 rounded bg-surface p-2 text-xs">
          {notice}
        </p>
      )}
    </section>
  );
}

const HANDOFF_COMPONENT: Record<string, string> = {
  configuration: "Configuración",
  library: "Biblioteca",
  vector_store: "Vector store",
};

const HANDOFF_FLOW: Record<string, string> = {
  configuration_deploy_request: "solicitud de despliegue",
  configuration_pin_required: "fijar la generación en una configuración y desplegarla",
  library_review: "revisión en Biblioteca",
  // Releases approved before generations existed.
  vector_store_promotion: "promoción del Vector Store",
};

const HANDOFF_STATUS: Record<string, string> = {
  pending: "pendiente de aprobación",
  manual: "requiere acción manual",
  promoted: "promovido",
};
