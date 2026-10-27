import { apiFetch, API_BASE } from "./client";
import type { FeatureConfiguration } from "./feature-recipes.functions";

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
// Resolution-method catalog tag (see resolution_method_catalog_port.py on
// the backend).
export type ApiResolutionTag =
  "scale_to_analyst" | "send_to_voicebot" | "handle_by_aria" | "block_soft" | "block_hard";
export type ApiShortageBehavior = {
  resolution_tag: ApiResolutionTag;
  resolution_method_id: string | null;
};

export type ApiGeneralSettings = {
  migration_window_enabled: boolean;
  migration_window_datetime: string;
};
export type ApiInfraSettings = {
  max_instances: number;
  auto_scale: boolean;
  fraud_history_db_retention_days: number;
  fraud_history_cold_storage_retention_months: number;
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

export type ApiProfilingStrategy = {
  key: "usuario" | "transaccion" | "transaccional";
  main_prompt: string;
  main_prompt_vars: string[];
  main_prompt_mode: "fstring" | "llm";
  use_pandas_history_mcp: boolean;
};
export type ApiProfilingConfig = {
  // Same wire shape as modelos/'s FeatureConfiguration - shared canonical
  // type for "recipe" across the whole frontend, see feature-recipes.functions.
  field_enrichment: FeatureConfiguration;
  strategies: ApiProfilingStrategy[];
};
export type ApiRuleCondition = {
  id: string;
  variable: string;
  comparison: "gt" | "gte" | "lt" | "lte" | "eq" | "neq" | "between" | "in";
  values: string[];
  score: number;
};
export type ApiDeterministicRule = ApiRuleCondition & {
  decision: "risk_suspected" | "risk";
  aric_action: "soft_block" | "hard_block";
};
export type ApiDeterministicConfig = {
  alert_filter: ApiFilterGroup;
  field_enrichment: FeatureConfiguration;
  rules: ApiDeterministicRule[];
};
export type ApiRubric = { id: string; name: string; conditions: ApiRuleCondition[] };

// Shared tool-picker fields (item 1/2/3 of the "reemplaza base de
// conocimiento vector store" request - see ToolPickerFields in
// @/data/configs and ClassificationConfig in the backend's
// configuration_port.py, which this mirrors 1:1). Membership direction for
// a selected watchlist isn't carried here - it's read off the watchlist
// itself (its list_type).
export type ApiResearchAgentConfig = {
  enabled: boolean;
  max_delegations: number;
  timeout_seconds: number;
  max_result_items: number;
};
export type ApiDelegatedResearchSettings = {
  vector_store: ApiResearchAgentConfig & {
    vector_store_instance_id: string | null;
    vector_store_generation?: number | null;
    similarity_threshold: number;
    max_documents_per_query: number;
    allowed_asset_types: string[];
  };
  history_pandas: ApiResearchAgentConfig & {
    max_history_rows: number;
    window_days: number;
    max_analysis_operations: number;
    planner?: "llm" | "heuristic";
    allowed_columns: string[];
    allowed_operations: string[];
  };
};
// Backend AgentToolsConfigSchema - identical for the four ReAct steps.
export type ApiToolPickerFields = {
  watchlist_enabled: boolean;
  watchlist_ids: string[];
  watchlist_compare_field: string | null;
  calculator_enabled: boolean;
  use_xgboost_model: boolean;
  xgboost_model_id: string | null;
  xgboost_fraud_threshold: number;
  xgboost_uncertainty_threshold: number;
  xgboost_shap_enabled: boolean;
  delegated_research: ApiDelegatedResearchSettings;
};
export type ApiClassificationConfig = ApiToolPickerFields & {
  prompt: string;
  prompt_vars: string[];
  max_thought_iterations: number;
  output_labels: string[];
};
export type ApiAdversarialConfig = ApiToolPickerFields & {
  prompt: string;
  prompt_vars: string[];
  max_cycles: number;
  feed_feedback_to_classification: boolean;
};
export type ApiDetectorConfig = ApiClassificationConfig;
export type ApiDetectorAdversarialConfig = ApiAdversarialConfig & {
  max_thought_iterations: number;
};

export type ApiVoicebotCategoryPrompt = { id: string; taxonomy_id: string; prompt: string };
export type ApiVoicebotConfig = {
  base_prompt: string;
  base_prompt_vars: string[];
  category_prompts: ApiVoicebotCategoryPrompt[];
};
export type ApiAnalystConfig = { prompt: string; prompt_vars: string[] };

export type ApiDocumentationConfig = {
  strategy: "template" | "agent";
  template: string;
  template_vars: string[];
  agent_prompt: string;
  agent_prompt_vars: string[];
};

export type ApiPromptField = { prompt: string; prompt_vars: string[] };
export type ApiExecutorConfig = {
  aric_marking: ApiPromptField;
  voicebot_call: ApiVoicebotConfig;
  documentador: ApiDocumentationConfig;
  analyst_escalation: ApiPromptField;
};

export type ApiAgentSettings = {
  deterministic: ApiDeterministicConfig;
  profiling: ApiProfilingConfig;
  rubrics: ApiRubric[];
  detector: ApiDetectorConfig;
  detector_adversarial: ApiDetectorAdversarialConfig;
  classification: ApiClassificationConfig;
  adversarial: ApiAdversarialConfig;
  analyst: ApiAnalystConfig;
  executor: ApiExecutorConfig;
  active_fields: string[];
  active_model_id: string | null;
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
  order: number;
};

export type CreateConfigurationRequest = {
  name: string;
  configuration_id?: string | null;
  // Optimistic-concurrency guard: the version this draft was loaded from.
  // Backend returns 409 if the lineage has since moved past it.
  based_on_version?: number | null;
  parent_ref?: { configuration_id: string; version: number } | null;
  description?: string;
  general: ApiGeneralSettings;
  infra: ApiInfraSettings;
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
  // Sticky - true once this version has ever gone to production, even if a
  // later version has since taken over. A save with based_on_version
  // pointing at a version where this is false overwrites it in place
  // instead of minting a new version.
  ever_activated: boolean;
  // Sticky - true after this version has completed a test run. The backend
  // requires it before accepting a promotion request.
  ever_tested: boolean;
  created_at: string;
  updated_at: string;
  parent_ref: { configuration_id: string; version: number } | null;
};

export type ConfigurationGraphNodeResponse = ConfigurationSummaryResponse & {
  // Message of the approved deploy request that promoted this version.
  promotion_comment: string | null;
};

export type ConfigurationDetailResponse = ConfigurationSummaryResponse & {
  general: ApiGeneralSettings;
  infra: ApiInfraSettings;
  test: ApiTestSettings;
  segments: Record<string, ApiSegmentSettings>;
  created_by: string | null;
};

export type ConfigurationChangeResponse = {
  path: string;
  previous: unknown;
  proposed: unknown;
};

export type TestConfigurationResponse = {
  valid: boolean;
  changes: ConfigurationChangeResponse[];
  warnings: string[];
};

export type ConfigurationDeployRequest = {
  id: string;
  target_configuration_id: string;
  target_version: number;
  current_configuration_id: string | null;
  current_version: number | null;
  title: string;
  message: string;
  changes: ConfigurationChangeResponse[];
  requested_by: string;
  requested_at: string;
  status: "pending" | "approved";
  approved_by: string | null;
  approved_at: string | null;
};

export type ConfigurationDeployRequestPreview = Pick<
  ConfigurationDeployRequest,
  | "target_configuration_id"
  | "target_version"
  | "current_configuration_id"
  | "current_version"
  | "changes"
>;

// --- Client functions -------------------------------------------------------

export function listConfigurations(): Promise<ConfigurationSummaryResponse[]> {
  return apiFetch("/api/v0/configurations");
}

export function getConfigurationGraph(): Promise<ConfigurationGraphNodeResponse[]> {
  return apiFetch("/api/v0/configurations/graph");
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

export function testConfiguration({
  data,
  signal,
}: {
  data: CreateConfigurationRequest;
  signal?: AbortSignal;
}): Promise<TestConfigurationResponse> {
  return apiFetch("/api/v0/configuration/test", {
    method: "POST",
    body: JSON.stringify(data),
    signal,
  });
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

export function previewConfigurationDeployRequest({
  data,
}: {
  data: { configurationId: string; version: number };
}): Promise<ConfigurationDeployRequestPreview> {
  const params = new URLSearchParams({
    target_configuration_id: data.configurationId,
    target_version: String(data.version),
  });
  return apiFetch(`/api/v0/configuration-deploy-requests/preview?${params}`);
}

export function createConfigurationDeployRequest({
  data,
}: {
  data: { configurationId: string; version: number; title: string; message: string };
}): Promise<ConfigurationDeployRequest> {
  return apiFetch("/api/v0/configuration-deploy-requests", {
    method: "POST",
    body: JSON.stringify({
      target_configuration_id: data.configurationId,
      target_version: data.version,
      title: data.title,
      message: data.message,
    }),
  });
}

export function listConfigurationDeployRequests(): Promise<ConfigurationDeployRequest[]> {
  return apiFetch("/api/v0/configuration-deploy-requests");
}

export function approveConfigurationDeployRequest({
  data,
}: {
  data: { requestId: string };
}): Promise<ConfigurationDeployRequest> {
  return apiFetch(
    `/api/v0/configuration-deploy-requests/${encodeURIComponent(data.requestId)}/approve`,
    {
      method: "POST",
    },
  );
}
