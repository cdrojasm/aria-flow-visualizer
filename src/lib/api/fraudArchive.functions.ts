import { apiFetch } from "./client";

// Cold fraud-history archive and legal holds (backend PENDIENTES #11c).
// Reading the archive needs `fraud_archive`; operating holds needs `legal_hold`.
// Every search and read is audited server-side.

export type ArchiveSearchBy = "alert_id" | "event_id" | "day";

export type ApiArchivedAlertHit = {
  alert_id: string;
  event_id: string | null;
  created_day: string;
  legal_hold: boolean;
};

export type ApiArchivedAlert = {
  alert_id: string;
  created_day: string;
  archive_object: string;
  // "record": the alert's own SHA-256; "object": the whole day object's.
  verified_against: "record" | "object";
  alert: Record<string, unknown>;
  fraud_label_reviews: Array<Record<string, unknown>>;
};

export type ApiLegalHold = {
  alert_id: string;
  active: boolean;
  reason: string;
  case_reference: string | null;
  placed_by: string;
  placed_at: string;
  released_at: string | null;
  released_by: string | null;
  release_reason: string | null;
};

const base = "/api/v0/fraud-history";

export function searchArchivedAlerts(by: ArchiveSearchBy, value: string) {
  const params = new URLSearchParams({ [by]: value.trim(), limit: "100" });
  return apiFetch<ApiArchivedAlertHit[]>(`${base}/archive?${params}`);
}

export function getArchivedAlert(alertId: string) {
  return apiFetch<ApiArchivedAlert>(`${base}/archive/${encodeURIComponent(alertId)}`);
}

/** The hold of one alert (active or released); null when it never had one. */
export async function getLegalHold(alertId: string): Promise<ApiLegalHold | null> {
  try {
    return await apiFetch<ApiLegalHold>(`${base}/legal-holds/${encodeURIComponent(alertId)}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("-> 404")) return null;
    throw error;
  }
}

export function listLegalHolds() {
  return apiFetch<ApiLegalHold[]>(`${base}/legal-holds?limit=200`);
}

export function placeLegalHold(data: { alertId: string; reason: string; caseReference: string }) {
  return apiFetch<ApiLegalHold>(`${base}/legal-holds/${encodeURIComponent(data.alertId)}`, {
    method: "PUT",
    body: JSON.stringify({
      reason: data.reason,
      case_reference: data.caseReference.trim() || null,
    }),
  });
}

export function releaseLegalHold(data: { alertId: string; reason: string }) {
  return apiFetch<ApiLegalHold>(`${base}/legal-holds/${encodeURIComponent(data.alertId)}/release`, {
    method: "POST",
    body: JSON.stringify({ reason: data.reason }),
  });
}

/** Backend `detail.code` of a failed call, e.g. LEGAL_HOLD_ALREADY_ACTIVE. */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/"code"\s*:\s*"([A-Z_]+)"/);
  return match ? match[1] : null;
}

const MESSAGES: Record<string, string> = {
  LEGAL_HOLD_ALREADY_ACTIVE: "Esa alerta ya está retenida.",
  LEGAL_HOLD_NOT_ACTIVE: "Esa alerta no tiene una retención activa.",
  ALERT_NOT_FOUND: "No existe una alerta con ese ID (ni caliente ni archivada).",
  LEGAL_HOLD_REASON: "El motivo debe tener entre 10 y 1.000 caracteres.",
  ARCHIVED_ALERT_NOT_FOUND: "Esa alerta no está en el archivo.",
  ARCHIVE_INTEGRITY_FAILED:
    "El archivo no pasó la verificación de integridad; no se muestra su contenido.",
  ARCHIVE_SEARCH_CRITERIA: "Usa un solo criterio de búsqueda.",
};

export function archiveErrorMessage(error: unknown): string {
  const code = apiErrorCode(error);
  if (code && MESSAGES[code]) return MESSAGES[code];
  return error instanceof Error && error.message.includes("-> 403")
    ? "Tu rol no tiene permiso para esta acción."
    : "No se pudo completar la operación. Inténtalo de nuevo.";
}
