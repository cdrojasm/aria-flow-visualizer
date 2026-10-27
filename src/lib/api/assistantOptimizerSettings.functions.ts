import { apiFetch } from "./client";

export type AssistantOptimizerSettings = Record<string, boolean | number | string | string[]> & {
  assistant_enabled: boolean;
  assistant_max_message_chars: number;
  assistant_max_messages_per_session: number;
  max_sessions_per_user: number;
  chat_retention_days: number;
  optimizer_enabled: boolean;
  optimizer_max_concurrent_sessions: number;
  optimizer_max_concurrent_runs: number;
  optimizer_max_parallel_experiments: number;
  optimizer_max_candidates_per_session: number;
  optimizer_session_budget_ceiling_tokens: number;
  optimizer_session_budget_ceiling_usd: number;
  optimizer_session_budget_ceiling_seconds: number;
  optimizer_budget_renewal_requires_approval: boolean;
  optimizer_max_budget_renewals: number;
  optimizer_iterations_without_improvement: number;
  optimizer_stop_on_critical_failure: boolean;
  optimizer_max_retryable_failures: number;
  objective_precision_floor: number;
  objective_minimum_support_per_segment: number;
  objective_minimum_count_to_publish_aggregates: number;
  objective_minimum_mature_alert_coverage_pct: number;
  sampler_enabled: boolean;
  sampler_period_trigger_enabled: boolean;
  sampler_period_trigger_interval_days: number;
  sampler_volume_trigger_enabled: boolean;
  sampler_statistical_trigger_enabled: boolean;
  sampler_statistical_trigger_threshold: number;
  sampler_cooldown_days: number;
  sampler_period_days: number;
  sampler_volume_threshold: number;
  sampler_error_margin_pct: number;
  sampler_confidence_pct: number;
  sampler_strata: string[];
  sampler_minimum_per_stratum: number;
  sampler_fraud_oversampling_ratio: number;
  sampler_train_proportion: number;
  sampler_validation_proportion: number;
  sampler_test_proportion: number;
  sampler_seed_policy: string;
  sampler_max_retained_samples: number;
  sampler_compatible_schema_versions: string[];
};

export type AssistantOptimizerSettingsChange = {
  id: string;
  changed_by: string;
  changed_at: string;
  changes: { path: string; previous: unknown; new: unknown }[];
};

const SETTINGS_PATH = "/api/v0/assistant-optimizer-settings";

export function getAssistantOptimizerSettings() {
  return apiFetch<AssistantOptimizerSettings>(SETTINGS_PATH);
}

export function updateAssistantOptimizerSettings(settings: AssistantOptimizerSettings) {
  return apiFetch<AssistantOptimizerSettings>(SETTINGS_PATH, {
    method: "PUT",
    body: JSON.stringify({ settings }),
  });
}

export function listAssistantOptimizerSettingsChanges(limit = 10) {
  return apiFetch<AssistantOptimizerSettingsChange[]>(`${SETTINGS_PATH}/changes?limit=${limit}`);
}

export type MatureSamplePreview = {
  eligible_alerts: number;
  estimated_sample_size: number;
  counts_by_stratum: Record<string, number>;
  active_triggers: string[];
};

export type MatureSampleOperation = { id: string; status: string };

export type MatureSamplerSchemaFieldOption = {
  field: string;
  type: string;
  description: string;
};

export type MatureSamplerSchemaConfiguration = {
  initial_mark_fields: MatureSamplerSchemaFieldOption[];
  initial_marking_date_fields: MatureSamplerSchemaFieldOption[];
  target_fields: MatureSamplerSchemaFieldOption[];
  marking_date_fields: MatureSamplerSchemaFieldOption[];
  mapping: {
    initial_mark_field: string;
    initial_marking_date_field: string;
    target_field: string;
    marking_date_field: string;
    label_value_mapping: Record<string, "fraud" | "no_fraud">;
  };
};

export function getMatureSamplerSchemaConfiguration() {
  return apiFetch<MatureSamplerSchemaConfiguration>(
    `${SETTINGS_PATH}/sampler/schema-configuration`,
  );
}

export function updateMatureSamplerSchemaConfiguration(
  mapping: MatureSamplerSchemaConfiguration["mapping"],
) {
  return apiFetch<MatureSamplerSchemaConfiguration>(
    `${SETTINGS_PATH}/sampler/schema-configuration`,
    { method: "PUT", body: JSON.stringify(mapping) },
  );
}

export function getMatureSamplerFields() {
  return apiFetch<string[]>(`${SETTINGS_PATH}/sampler/fields`);
}

export function previewMatureSample() {
  return apiFetch<MatureSamplePreview>(`${SETTINGS_PATH}/sampler/preview`, {
    method: "POST",
  });
}

export function startMatureSample() {
  return apiFetch<MatureSampleOperation>(`${SETTINGS_PATH}/sampler/run`, {
    method: "POST",
  });
}
