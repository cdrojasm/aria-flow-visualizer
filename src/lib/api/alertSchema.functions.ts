import { apiFetch } from "./client";

export type AlertSchemaFieldType = "string" | "number" | "bool" | "date" | "datetime" | "list";
export type AlertSchemaDataSource = "aric" | "host" | "aria";

export type AlertSchemaField = {
  id: string;
  data_source: AlertSchemaDataSource;
  field: string;
  field_name: string;
  field_ds_loc: string;
  type: AlertSchemaFieldType;
  is_alert: boolean;
  is_mandatory: boolean;
  is_history: boolean;
  is_core: boolean;
  is_label: boolean;
  is_sensible: boolean;
  sensitivity_strategy: string | null;
  group: string;
  description: string;
  use_locale: boolean;
  locale_type: string | null;
};

export type AlertSchemaVersion = {
  version: number;
  status: string;
  fields: AlertSchemaField[];
  field_roles: Record<string, string>;
  proposed_by: string | null;
  proposed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  impact_acknowledged: boolean;
  based_on_version: number | null;
  comparison: Record<string, unknown>;
  impact: Record<string, unknown>[];
};

export type AlertSchemaDraft = Pick<AlertSchemaVersion, "fields" | "field_roles"> & {
  version?: number | null;
  based_on_version?: number | null;
};

export type AlertSchemaSuggestion = {
  id: string;
  alert_id: string;
  field: string;
  location: string;
  comment: string;
  created_by: string;
  created_at: string;
};

export type AlertSchemaPresenceField = {
  field_id: string;
  field: string;
  location: string;
  present_count: number;
  last_seen: string | null;
  trend: Record<string, number | null>;
  example: string | null;
  distribution: {
    kind: string;
    count?: number;
    frequencies?: Record<string, number>;
    percentiles?: Record<string, number | null>;
  } | null;
};

export type AlertSchemaPresence = {
  report_day: string;
  generated_at: string;
  schema_version: number;
  alert_count: number;
  fields: AlertSchemaPresenceField[];
  unknown_locations: { location: string; frequency: number }[];
};

export function listAlertSchemaVersions(): Promise<AlertSchemaVersion[]> {
  return apiFetch("/api/v0/alert-schema/versions");
}

export function getAlertSchemaVersion(version: number): Promise<AlertSchemaVersion> {
  return apiFetch(`/api/v0/alert-schema/versions/${version}`);
}

export function saveAlertSchemaDraft({
  data,
}: {
  data: AlertSchemaDraft;
}): Promise<AlertSchemaVersion> {
  return apiFetch("/api/v0/alert-schema/drafts", { method: "POST", body: JSON.stringify(data) });
}

export function proposeAlertSchema(version: number): Promise<AlertSchemaVersion> {
  return apiFetch(`/api/v0/alert-schema/versions/${version}/propose`, { method: "POST" });
}

export function approveAlertSchema({
  version,
  impactAcknowledged,
}: {
  version: number;
  impactAcknowledged: boolean;
}): Promise<AlertSchemaVersion> {
  return apiFetch(`/api/v0/alert-schema/versions/${version}/approve`, {
    method: "POST",
    body: JSON.stringify({ impact_acknowledged: impactAcknowledged }),
  });
}

export function rejectAlertSchema(version: number): Promise<AlertSchemaVersion> {
  return apiFetch(`/api/v0/alert-schema/versions/${version}/reject`, { method: "POST" });
}

export function listAlertSchemaSuggestions(): Promise<AlertSchemaSuggestion[]> {
  return apiFetch("/api/v0/alert-schema/suggestions");
}

export function getAlertSchemaPresence(): Promise<AlertSchemaPresence | null> {
  return apiFetch("/api/v0/alert-schema/presence");
}

export function getActiveAlertSchema(): Promise<AlertSchemaVersion | null> {
  return apiFetch("/api/v0/alert-schema/active");
}

export function getAlertRaw({
  data,
}: {
  data: { alertId: string };
}): Promise<Record<string, unknown>> {
  return apiFetch(`/api/v0/alerts/${encodeURIComponent(data.alertId)}/raw`);
}

export function createAlertSchemaSuggestion({
  data,
}: {
  data: { alertId: string; field: string; location: string; comment: string };
}): Promise<AlertSchemaSuggestion> {
  return apiFetch("/api/v0/alert-schema/suggestions", {
    method: "POST",
    body: JSON.stringify({
      alert_id: data.alertId,
      field: data.field,
      location: data.location,
      comment: data.comment,
    }),
  });
}
