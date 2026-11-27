import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Search,
} from "lucide-react";
import type { ConfigurationDeployRequest } from "@/lib/api/configurations.functions";

type SortKey = "requested_at" | "requested_by" | "status";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: "requested_at", label: "Recientes", className: "w-36" },
  { key: "requested_by", label: "Solicitante", className: "w-44" },
  { key: "status", label: "Estado", className: "w-40" },
];

function compare(a: ConfigurationDeployRequest, b: ConfigurationDeployRequest, key: SortKey) {
  if (key === "requested_at") return Date.parse(a.requested_at) - Date.parse(b.requested_at);
  return a[key].localeCompare(b[key], "es", { sensitivity: "base" });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

type Props = {
  requests: ConfigurationDeployRequest[];
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  isStale: (request: ConfigurationDeployRequest) => boolean;
  approving: boolean;
  onApprove: (id: string) => void;
};

/**
 * Collapsible list of deploy requests: search by title, sortable columns
 * (most recent, requester, status) and a bounded scroll area so a long
 * history never pushes the rest of the page down.
 */
export function DeployRequestsPanel({
  requests,
  isLoading,
  isError,
  error,
  isStale,
  approving,
  onApprove,
}: Props) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("requested_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const pending = requests.filter((request) => request.status === "pending").length;

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es");
    const filtered = needle
      ? requests.filter((request) => request.title.toLocaleLowerCase("es").includes(needle))
      : requests;
    const sign = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => sign * compare(a, b, sortKey));
  }, [requests, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "requested_at" ? "desc" : "asc");
    }
  };

  return (
    <section
      data-testid="deploy-requests-panel"
      className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
            Solicitudes de despliegue
          </h2>
          <p className="mt-1 text-[12px] text-text-secondary">
            Aprueba una solicitud para promover exactamente la versión solicitada a producción.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-text-secondary">
            {pending} pendiente{pending === 1 ? "" : "s"} · {requests.length} en total
          </span>
          <ClipboardList className="h-5 w-5 text-primary" />
          <button
            type="button"
            aria-expanded={open}
            aria-controls="deploy-requests-body"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] hover:bg-surface"
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? "Contraer" : "Expandir"}
          </button>
        </div>
      </div>

      {open && (
        <div id="deploy-requests-body" className="mt-4 space-y-3">
          {error && (
            <p
              className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger"
              role="alert"
            >
              {error}
            </p>
          )}
          {isLoading ? (
            <p className="text-[13px] text-text-secondary">Cargando solicitudes…</p>
          ) : isError ? (
            <p className="text-[13px] text-danger">No se pudieron cargar las solicitudes.</p>
          ) : requests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-5 text-[13px] text-text-secondary">
              No hay solicitudes de despliegue.
            </p>
          ) : (
            <>
              <label className="relative block max-w-sm">
                <span className="sr-only">Buscar solicitudes por título</span>
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-secondary" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por título…"
                  className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-[12px] focus:border-primary focus:outline-none"
                />
              </label>

              <div className="max-h-96 overflow-auto rounded-lg border border-border">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-surface text-[11px] uppercase tracking-wider text-text-secondary">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Solicitud</th>
                      {COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={`${column.className} px-3 py-2 font-semibold`}
                          aria-sort={
                            sortKey === column.key
                              ? sortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(column.key)}
                            className="inline-flex items-center gap-1 uppercase hover:text-text-primary"
                          >
                            {column.label}
                            {sortKey === column.key &&
                              (sortDir === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3" />
                              ))}
                          </button>
                        </th>
                      ))}
                      <th className="w-44 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-[12px]">
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={COLUMNS.length + 2} className="px-3 py-4 text-text-secondary">
                          Ninguna solicitud coincide con “{query}”.
                        </td>
                      </tr>
                    ) : (
                      rows.map((request) => {
                        const stale = request.status === "pending" && isStale(request);
                        return (
                          <tr
                            key={request.id}
                            data-testid="deploy-request-row"
                            className="align-top"
                          >
                            <td className="px-3 py-2">
                              <p
                                className="truncate text-[13px] font-semibold text-text-primary"
                                title={request.title}
                              >
                                {request.title}
                              </p>
                              <p className="truncate text-text-secondary" title={request.message}>
                                {request.message}
                              </p>
                              <p className="truncate text-[11px] text-text-secondary">
                                {request.target_configuration_id}:v{request.target_version}
                                {request.current_configuration_id
                                  ? ` · producción actual ${request.current_configuration_id}:v${request.current_version}`
                                  : ""}
                                {` · ${request.changes.length} cambios`}
                              </p>
                              {stale && (
                                <p className="mt-1 font-medium text-danger" role="alert">
                                  Obsoleta: producción cambió después de esta solicitud. Pide una
                                  nueva revisión antes de desplegar.
                                </p>
                              )}
                            </td>
                            <td
                              className="truncate px-3 py-2 text-text-primary"
                              title={request.requested_by}
                            >
                              {request.requested_by}
                            </td>
                            <td className="px-3 py-2 text-text-secondary">
                              {formatDate(request.requested_at)}
                            </td>
                            <td className="px-3 py-2">
                              {request.status === "pending" ? (
                                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                                  Pendiente
                                </span>
                              ) : (
                                <span className="text-[11px] font-medium text-success">
                                  Aprobada por {request.approved_by ?? "—"}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {request.status === "pending" && (
                                <button
                                  type="button"
                                  disabled={approving || stale}
                                  onClick={() => onApprove(request.id)}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar y desplegar
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
