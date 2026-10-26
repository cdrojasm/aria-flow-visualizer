import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { AgentEvent } from "@/lib/api/agent.functions";
import {
  EVENT_KIND_LABEL,
  EVENT_OUTCOME_LABEL,
  OUTCOME_TONE,
  REF_LABEL,
  SPECIALIST_LABEL,
  TONE_CLASS,
  shortRef,
} from "./labels";

const CLOCK = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "America/Bogota",
});

/** Everything the agent did, newest first, grouped by iteration. */
export function SessionTimeline({ events, loading }: { events: AgentEvent[]; loading: boolean }) {
  const [kind, setKind] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const visible = useMemo(
    () =>
      [...events]
        .filter((event) => !kind || event.kind === kind)
        .filter((event) => !onlyProblems || ["FAILED", "BLOCKED"].includes(event.outcome))
        .sort((left, right) => right.seq - left.seq),
    [events, kind, onlyProblems],
  );
  const groups = useMemo(() => {
    const result: { key: string; title: string; items: AgentEvent[] }[] = [];
    for (const event of visible) {
      const iteration = event.refs.iteration;
      const key = iteration ?? "session";
      const last = result.at(-1);
      if (last && last.key === key) last.items.push(event);
      else
        result.push({
          key,
          title: iteration ? `Iteración ${iteration}` : "Sesión",
          items: [event],
        });
    }
    return result;
  }, [visible]);

  return (
    <section aria-label="Línea de tiempo del optimizador" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <label className="flex items-center gap-2 text-text-secondary">
          Tipo
          <select
            aria-label="Filtrar por tipo de evento"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="rounded-lg border border-border bg-card px-2 py-1 text-text-primary"
          >
            <option value="">Todos</option>
            {Object.entries(EVENT_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-text-secondary">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(event) => setOnlyProblems(event.target.checked)}
          />
          Solo fallos y esperas
        </label>
        <span className="ml-auto text-text-secondary tabular-nums">
          {visible.length} de {events.length} eventos
        </span>
      </div>

      {loading && events.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-[13px] text-text-secondary">
          Cargando la línea de tiempo…
        </p>
      ) : events.length === 0 ? (
        <p
          data-testid="timeline-empty"
          className="rounded-lg border border-dashed border-border p-4 text-[13px] text-text-secondary"
        >
          Todavía no hay eventos. Aparecerán en cuanto el agente inicie su primera iteración.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-[13px] text-text-secondary">
          Ningún evento coincide con el filtro.
        </p>
      ) : (
        <ol className="space-y-4" data-testid="timeline-list">
          {groups.map((group, index) => (
            <li key={`${group.key}-${index}`}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((event) => (
                  <TimelineRow key={event.seq} event={event} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TimelineRow({ event }: { event: AgentEvent }) {
  const tone = OUTCOME_TONE[event.outcome];
  const production = event.kind === "production_change";
  const refs = Object.entries(event.refs).filter(
    ([key]) => key !== "iteration" && key !== "specialist",
  );
  return (
    <li
      data-kind={event.kind}
      data-outcome={event.outcome}
      className={`rounded-lg border px-3 py-2 text-[12px] ${production ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <time className="tabular-nums text-text-secondary" dateTime={event.occurred_at}>
          {CLOCK.format(new Date(event.occurred_at))}
        </time>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TONE_CLASS[tone]}`}
        >
          {EVENT_KIND_LABEL[event.kind] ?? event.kind} · {EVENT_OUTCOME_LABEL[event.outcome]}
        </span>
        <span className="font-medium text-text-primary">{event.summary}</span>
        {event.refs.specialist && (
          <span className="text-text-secondary">
            · {SPECIALIST_LABEL[event.refs.specialist] ?? event.refs.specialist}
          </span>
        )}
        {event.duration_ms != null && (
          <span className="text-text-secondary tabular-nums">· {event.duration_ms} ms</span>
        )}
        {event.cost_micros != null && (
          <span className="text-text-secondary tabular-nums">
            · ${(event.cost_micros / 1_000_000).toFixed(4)}
          </span>
        )}
      </div>
      {(refs.length > 0 || event.reason_code || production) && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-text-secondary">
          {production && (
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Registrado también en el log de auditoría
            </span>
          )}
          {event.reason_code && (
            <code className="rounded bg-surface px-1">{event.reason_code}</code>
          )}
          {refs.map(([key, value]) => (
            <span key={key} className="rounded bg-surface px-1.5 py-0.5" title={value}>
              {REF_LABEL[key] ?? key} {shortRef(value)}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
