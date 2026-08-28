import { apiFetch, API_BASE } from "./client";

// Client functions wrapping the backend's configuration CRUD/versioning API
// (../backend, base path /api/v0/configurations — see backend/CLAUDE.md).
// Types here are a field-for-field mirror of
// backend/src/infrastructure/entrypoint/api/schemas.py's Configuration*
// section (snake_case, as the wire format is). src/lib/api/
// configurationMapping.ts converts to/from the frontend's camelCase
// ConfigSettings (src/data/configs.ts).

// --- Wire types (snake_case, mirrors schemas.py) --------------------------

export type ApiDayProfile = { id: string; name: string; description: string; hourly: number[] };
export type ApiAnalystCapacity = {
  profiles: ApiDayProfile[];
  default_profile_id: string;
  day_overrides: Record<string, string>;
};
export type ApiShortageAction = "block-soft" | "block-hard" | "pass" | "move-to-analyst" | "move-to-voicebot";
export type ApiShortageBehavior = { action: ApiShortageAction };

export type ApiGeneralSettings = {
  agent_enabled: boolean;
  migration_window_enabled: boolean;
  migration_window_hour: number;
  analyst_escalation_enabled: boolean;
  voicebot_escalation_enabled: boolean;
};
export type ApiInfraSettings = {
  max_instances: number;
  auto_scale: boolean;
  fraud_history_db_retention_days: number;
  fraud_history_cold_storage_retention_months: number;
};
export type ApiOpsSettings = {
  voicebot_max_concurrent_calls: number;
  analyst_capacity: ApiAnalystCapacity;
  queue_max_lifetime_value: number;
  queue_max_lifetime_unit: "minutes" | "hours" | "days";
  queue_discard_amount_threshold: number;
  queue_rule_filter_enabled: boolean;
  queue_allowed_triggered_rules: string[];
  voicebot_shortage_behavior: ApiShortageBehavior;
  analyst_shortage_behavior: ApiShortageBehavior;
};
export type ApiTestSettings = {
  max_test_instances: number;
  max_concurrent_experiments: number;
  experiment_timeout_minutes: number;
  max_stored_test_runs: number;
  test_cleanup_policy: "manual" | "oldest" | "failed-first";
};

export type ApiDistributionValue = { id: string; label: string; pct: number };
export type ApiSamplingCriterion = { id: string; name: string; values: ApiDistributionValue[] };
export type ApiMonitoringSettings = {
  sampling_interval_value: number;
  sampling_interval_unit: "minutes" | "hours" | "days";
  sampling_criteria: ApiSamplingCriterion[];
  max_samples: number;
  prompt_clasificacion: string;
  prompt_clasificacion_vars: string[];
  prompt_analista: string;
  prompt_analista_vars: string[];
  prompt_monitoreo: string;
  prompt_monitoreo_vars: string[];
};

export type ApiCriteriaMode =
  | "intervalo"
  | "comparativa"
  | "igualdad"
  | "no_igualdad"
  | "pertenencia"
  | "no_pertenencia";
export type ApiComparisonOperator = ">" | ">=" | "<" | "<=";
export type ApiFieldCriterion = {
  id: string;
  mode: ApiCriteriaMode;
  output: string;
  min_value: number | null;
  max_value: number | null;
  operator: ApiComparisonOperator | null;
  numeric_value: number | null;
  text_value: string | null;
  values: string[];
};
export type ApiFieldCategorization = {
  field: string;
  kind: "cuantizable" | "categorico";
  criteria: ApiFieldCriterion[];
};
export type ApiProfilingStrategy = {
  key: "usuario" | "transaccion" | "transaccional";
  main_prompt: string;
  main_prompt_vars: string[];
  categorization_prompt: string;
  categorization_prompt_vars: string[];
  produced_variables: string[];
  use_pandas_history_mcp: boolean;
};
export type ApiProfilingConfig = {
  field_categorizations: ApiFieldCategorization[];
  strategies: ApiProfilingStrategy[];
};

export type ApiClassificationConfig = {
  vector_store_tools: string[];
  built_in_tools: string[];
  prompt: string;
  prompt_vars: string[];
};
export type ApiAdversarialConfig = {
  prompt: string;
  prompt_vars: string[];
  max_cycles: number;
  feed_feedback_to_classification: boolean;
};

export type ApiAnalystPlaybook = {
  id: string;
  name: string;
  strategy: string;
  resolution_tag: "scale_to_analyst" | "send_to_voicebot" | "handle_by_aria";
};
export type ApiVoicebotCategoryPrompt = { id: string; taxonomy_id: string; prompt: string };
export type ApiVoicebotConfig = {
  base_prompt: string;
  base_prompt_vars: string[];
  category_prompts: ApiVoicebotCategoryPrompt[];
};
export type ApiAnalystConfig = { playbooks: ApiAnalystPlaybook[]; voicebot: ApiVoicebotConfig };

export type ApiDocumentationConfig = {
  strategy: "template" | "agent";
  template: string;
  template_vars: string[];
  agent_prompt: string;
  agent_prompt_vars: string[];
};

export type ApiTaxonomy = {
  id: string;
  code: string;
  name: string;
  description: string;
  variables: string[];
  examples: string[];
  active: boolean;
  segmento: string;
};
export type ApiModusOperandi = {
  id: string;
  title: string;
  narrative: string;
  taxonomy_id: string;
  evolved_variables: string[];
  active: boolean;
  segmento: string;
};
export type ApiFlag = {
  id: string;
  flag_type: "red" | "yellow";
  name: string;
  description: string;
  evolved_variables: string[];
  modus_operandi_ids: string[];
  segmento: string;
};
export type ApiExampleCase = {
  id: string;
  text: string;
  modus_operandi_id: string;
  taxonomy_id: string;
  segmento: string;
};

export type ApiAgentSettings = {
  profiling: ApiProfilingConfig;
  classification: ApiClassificationConfig;
  adversarial: ApiAdversarialConfig;
  analyst: ApiAnalystConfig;
  documentation: ApiDocumentationConfig;
  taxonomies: ApiTaxonomy[];
  modus_operandi: ApiModusOperandi[];
  flags: ApiFlag[];
  example_cases: ApiExampleCase[];
  active_fields: string[];
};

export type ApiFilterCondition = {
  id: string;
  category: "integration_point" | "triggered_rule" | "event_type";
  operator: "in";
  values: string[];
};
export type ApiFilterGroup = {
  id: string;
  operator: "and" | "or";
  conditions: ApiFilterCondition[];
  groups: ApiFilterGroup[];
};

export type ApiSegmentSettings = {
  enabled: boolean;
  filter: ApiFilterGroup;
  monitoring: ApiMonitoringSettings;
  agent: ApiAgentSettings;
};

export type CreateConfigurationRequest = {
  name: string;
  configuration_id?: string | null;
  // Optimistic-concurrency guard: the version this draft was loaded from.
  // Backend returns 409 if the lineage has since moved past it.
  based_on_version?: number | null;
  description?: string;
  general: ApiGeneralSettings;
  infra: ApiInfraSettings;
  ops: ApiOpsSettings;
  test: ApiTestSettings;
  created_by?: string | null;
  segments: Record<string, ApiSegmentSettings>;
};

export type ConfigurationSummaryResponse = {
  configuration_id: string;
  version: number;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ConfigurationDetailResponse = ConfigurationSummaryResponse & {
  general: ApiGeneralSettings;
  infra: ApiInfraSettings;
  ops: ApiOpsSettings;
  test: ApiTestSettings;
  segments: Record<string, ApiSegmentSettings>;
  created_by: string | null;
};

// --- Client functions -------------------------------------------------------

export function listConfigurations(): Promise<ConfigurationSummaryResponse[]> {
  return apiFetch("/api/v0/configurations");
}

export async function getActiveConfiguration(): Promise<ConfigurationDetailResponse | null> {
  const res = await fetch(`${API_BASE}/api/v0/configurations/active`, {
    headers: { "Content-Type": "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok)
    throw new Error(`/api/v0/configurations/active -> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<ConfigurationDetailResponse>;
}

export function listConfigurationVersions({
  data,
}: {
  data: { configurationId: string };
}): Promise<ConfigurationSummaryResponse[]> {
  return apiFetch(`/api/v0/configurations/${encodeURIComponent(data.configurationId)}`);
}

export function getConfigurationVersion({
  data,
}: {
  data: { configurationId: string; version: number };
}): Promise<ConfigurationDetailResponse> {
  return apiFetch(
    `/api/v0/configurations/${encodeURIComponent(data.configurationId)}/versions/${data.version}`,
  );
}

// data is the full CreateConfigurationRequest — passed as an opaque JSON
// value, already built by src/lib/api/configurationMapping.ts from typed
// frontend state.
export function createConfiguration({
  data,
}: {
  data: CreateConfigurationRequest;
}): Promise<ConfigurationDetailResponse> {
  return apiFetch("/api/v0/configurations", { method: "POST", body: JSON.stringify(data) });
}

export function activateConfiguration({
  data,
}: {
  data: { configurationId: string; version: number };
}): Promise<ConfigurationDetailResponse> {
  return apiFetch(
    `/api/v0/configurations/${encodeURIComponent(data.configurationId)}/versions/${data.version}/activate`,
    { method: "POST" },
  );
}
