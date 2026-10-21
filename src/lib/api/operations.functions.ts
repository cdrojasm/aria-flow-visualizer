import { apiFetch } from "./client";
import type { AmountTier } from "@/lib/amountTiers";
import type { ApiAnalystCapacity, ApiShortageBehavior } from "./configurations.functions";
import type {
  AnalystCapacity,
  ListMembershipMode,
  SamplingIntervalUnit,
  ShortageBehavior,
  TestCleanupPolicy,
} from "@/data/configs";

// Client functions for the immediate (non-versioned) operation levers and
// the live resource/queue state - mirrors backend's
// operational_settings_router.py, operations_router.py and
// analyst_queue_router.py. Unlike /configurations, nothing here goes
// through a version/test/activate cycle: a save takes effect right away.

// --- Operational settings (singleton) ------------------------------------

export type ApiOperationalSettings = {
  agent_enabled: boolean;
  analyst_enabled: boolean;
  voicebot_enabled: boolean;
  max_instances: number;
  auto_scale: boolean;
  voicebot_max_concurrent_calls: number;
  analyst_capacity: ApiAnalystCapacity;
  queue_max_lifetime_value: number;
  queue_max_lifetime_unit: SamplingIntervalUnit;
  queue_discard_amount_threshold: number;
  queue_rule_filter_enabled: boolean;
  queue_rule_filter_mode: ListMembershipMode;
  queue_allowed_triggered_rules: string[];
  queue_discard_behavior: ApiShortageBehavior;
  max_test_instances: number;
  max_concurrent_experiments: number;
  experiment_timeout_minutes: number;
  max_stored_test_runs: number;
  test_cleanup_policy: TestCleanupPolicy;
  // Request: omitted/null keeps the current tiers, [] clears them; must be
  // contiguous, non-overlapping and cover 0 -> inf (else 422). Response:
  // always the full current list.
  amount_tiers: ApiAmountTier[] | null;
  // Share (0..1) of finished alerts sent to the reasoning LLM-judge; 0
  // disables it.
  reasoning_evaluation_sample_rate: number;
  maturing_days: number;
  expected_coverage_pct: number;
  stable_months: number;
};

// AmountTierSchema
export type ApiAmountTier = {
  code: string;
  label: string;
  min_inclusive: number;
  // null = unbounded (the last tier).
  max_exclusive: number | null;
};

export type OperationalSettings = {
  agentEnabled: boolean;
  analystEnabled: boolean;
  voicebotEnabled: boolean;
  voicebotMaxConcurrentCalls: number;
  analystCapacity: AnalystCapacity;
  queueMaxLifetimeValue: number;
  queueMaxLifetimeUnit: SamplingIntervalUnit;
  queueDiscardAmountThreshold: number;
  queueRuleFilterEnabled: boolean;
  queueRuleFilterMode: ListMembershipMode;
  queueAllowedTriggeredRules: string[];
  queueDiscardBehavior: ShortageBehavior;
  amountTiers: AmountTier[];
  reasoningEvaluationSampleRate: number;
  maturingDays: number;
  expectedCoveragePct: number;
  stableMonths: number;
  // Round-tripped untouched - edited elsewhere / not yet in this panel.
  passthrough: Pick<
    ApiOperationalSettings,
    | "max_instances"
    | "auto_scale"
    | "max_test_instances"
    | "max_concurrent_experiments"
    | "experiment_timeout_minutes"
    | "max_stored_test_runs"
    | "test_cleanup_policy"
  >;
};

export function operationalSettingsFromApi(api: ApiOperationalSettings): OperationalSettings {
  return {
    agentEnabled: api.agent_enabled,
    analystEnabled: api.analyst_enabled,
    voicebotEnabled: api.voicebot_enabled,
    voicebotMaxConcurrentCalls: api.voicebot_max_concurrent_calls,
    analystCapacity: {
      profiles: api.analyst_capacity.profiles,
      defaultProfileId: api.analyst_capacity.default_profile_id,
      dayOverrides: Object.fromEntries(
        Object.entries(api.analyst_capacity.day_overrides).map(([day, id]) => [Number(day), id]),
      ),
    },
    queueMaxLifetimeValue: api.queue_max_lifetime_value,
    queueMaxLifetimeUnit: api.queue_max_lifetime_unit,
    queueDiscardAmountThreshold: api.queue_discard_amount_threshold,
    queueRuleFilterEnabled: api.queue_rule_filter_enabled,
    queueRuleFilterMode: api.queue_rule_filter_mode,
    queueAllowedTriggeredRules: api.queue_allowed_triggered_rules,
    queueDiscardBehavior: {
      resolutionTag: api.queue_discard_behavior.resolution_tag,
      resolutionMethodId: api.queue_discard_behavior.resolution_method_id,
    },
    amountTiers: (api.amount_tiers ?? []).map((tier) => ({
      code: tier.code,
      label: tier.label,
      minInclusive: tier.min_inclusive,
      maxExclusive: tier.max_exclusive,
    })),
    reasoningEvaluationSampleRate: api.reasoning_evaluation_sample_rate,
    maturingDays: api.maturing_days,
    expectedCoveragePct: api.expected_coverage_pct,
    stableMonths: api.stable_months,
    passthrough: {
      max_instances: api.max_instances,
      auto_scale: api.auto_scale,
      max_test_instances: api.max_test_instances,
      max_concurrent_experiments: api.max_concurrent_experiments,
      experiment_timeout_minutes: api.experiment_timeout_minutes,
      max_stored_test_runs: api.max_stored_test_runs,
      test_cleanup_policy: api.test_cleanup_policy,
    },
  };
}

export function operationalSettingsToApi(s: OperationalSettings): ApiOperationalSettings {
  return {
    ...s.passthrough,
    agent_enabled: s.agentEnabled,
    analyst_enabled: s.analystEnabled,
    voicebot_enabled: s.voicebotEnabled,
    voicebot_max_concurrent_calls: s.voicebotMaxConcurrentCalls,
    analyst_capacity: {
      profiles: s.analystCapacity.profiles,
      default_profile_id: s.analystCapacity.defaultProfileId,
      day_overrides: Object.fromEntries(
        Object.entries(s.analystCapacity.dayOverrides).map(([day, id]) => [String(day), id]),
      ),
    },
    queue_max_lifetime_value: s.queueMaxLifetimeValue,
    queue_max_lifetime_unit: s.queueMaxLifetimeUnit,
    queue_discard_amount_threshold: s.queueDiscardAmountThreshold,
    queue_rule_filter_enabled: s.queueRuleFilterEnabled,
    queue_rule_filter_mode: s.queueRuleFilterMode,
    queue_allowed_triggered_rules: s.queueAllowedTriggeredRules,
    queue_discard_behavior: {
      resolution_tag: s.queueDiscardBehavior.resolutionTag,
      resolution_method_id: s.queueDiscardBehavior.resolutionMethodId ?? null,
    },
    // Always the full list.
    // when it actually differs from the stored one.
    amount_tiers: s.amountTiers.map((tier) => ({
      code: tier.code.trim(),
      label: tier.label.trim(),
      min_inclusive: tier.minInclusive,
      max_exclusive: tier.maxExclusive,
    })),
    reasoning_evaluation_sample_rate: s.reasoningEvaluationSampleRate,
    maturing_days: s.maturingDays,
    expected_coverage_pct: s.expectedCoveragePct,
    stable_months: s.stableMonths,
  };
}

export async function getOperationalSettings(): Promise<OperationalSettings> {
  return operationalSettingsFromApi(
    await apiFetch<ApiOperationalSettings>("/api/v0/operational-settings"),
  );
}

export async function updateOperationalSettings({
  data,
}: {
  data: { settings: OperationalSettings; changedBy?: string | null };
}): Promise<OperationalSettings> {
  return operationalSettingsFromApi(
    await apiFetch<ApiOperationalSettings>("/api/v0/operational-settings", {
      method: "PUT",
      body: JSON.stringify({
        settings: operationalSettingsToApi(data.settings),
        changed_by: data.changedBy ?? null,
      }),
    }),
  );
}

export type OperationalSettingsChange = {
  id: string;
  changed_by: string | null;
  changed_at: string;
  changes: { path: string; previous: unknown; new: unknown }[];
};

export function listOperationalSettingsHistory({
  data,
}: {
  data: { limit: number };
}): Promise<OperationalSettingsChange[]> {
  return apiFetch(`/api/v0/operational-settings/history?limit=${data.limit}`);
}

// --- Live capacity -------------------------------------------------------

export type ChannelCapacity = {
  available: number;
  // "available" | "exhausted" (on, every slot taken) | "unavailable" (off)
  status: string;
  total: number | null;
};

export type OperationsCapacity = {
  analysts: ChannelCapacity;
  voicebot: ChannelCapacity;
  bidi: ChannelCapacity;
  updated_at: string;
};

export function getOperationsCapacity(): Promise<OperationsCapacity> {
  return apiFetch("/api/v0/operations/capacity");
}

// --- Analyst queue -------------------------------------------------------

export type ResourceReservation = {
  id: string;
  resource: "voicebot" | "analyst";
  alert_id: string;
  holder: string;
  holder_name: string | null;
  reserved_at: string;
  expires_at: string;
  status: string;
  released_at: string | null;
  release_reason: string | null;
  detail: Record<string, unknown>;
};

export type AnalystQueueAlert = {
  alert_id: string;
  event_id: string;
  event_type: string;
  status: string;
  customer_id: string | null;
  created_at: string;
  schema_version: number | null;
  configuration_ref: { configuration_id: string; version: number } | null;
  input: Record<string, unknown>;
  labels: Record<string, unknown>;
  history_prev_alerta: Record<string, unknown>[];
  agent_output: Record<string, unknown>;
  reservation: ResourceReservation | null;
};

export type AlertStep = {
  step_name: string;
  status: string;
  attempt: number;
  output: unknown;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type AlertDetail = AnalystQueueAlert & {
  workflow_execution_id: string | null;
  workflow_status: string | null;
  workflow_output: Record<string, unknown> | null;
  steps: AlertStep[];
};

export function listAnalystQueue(): Promise<AnalystQueueAlert[]> {
  return apiFetch("/api/v0/analyst-queue");
}

export function getAlertDetail({ data }: { data: { alertId: string } }): Promise<AlertDetail> {
  return apiFetch(`/api/v0/analyst-queue/${encodeURIComponent(data.alertId)}`);
}

export function takeAlert({ data }: { data: { alertId: string } }): Promise<ResourceReservation> {
  return apiFetch(`/api/v0/analyst-queue/${encodeURIComponent(data.alertId)}/take`, {
    method: "POST",
  });
}

export type AnalystResolution = "block" | "pass" | "bidi";

export function resolveAlert({
  data,
}: {
  data: { alertId: string; decision: AnalystResolution; notes: string };
}): Promise<ResourceReservation> {
  return apiFetch(`/api/v0/analyst-queue/${encodeURIComponent(data.alertId)}/resolve`, {
    method: "POST",
    body: JSON.stringify({ decision: data.decision, notes: data.notes }),
  });
}

export function releaseAlert({
  data,
}: {
  data: { alertId: string };
}): Promise<ResourceReservation> {
  return apiFetch(`/api/v0/analyst-queue/${encodeURIComponent(data.alertId)}/release`, {
    method: "POST",
  });
}

// 409s from take/resolve/release carry {detail: {code, message}} - pulls
// the code back out of apiFetch's "<path> -> <status>: <body>" error.
export type QueueConflictCode =
  "analyst_busy" | "alert_taken" | "no_capacity" | "not_in_queue" | "not_held";

export function queueConflictCode(error: unknown): QueueConflictCode | null {
  if (!(error instanceof Error)) return null;
  const body = error.message.split(": ").slice(1).join(": ");
  try {
    return (JSON.parse(body)?.detail?.code as QueueConflictCode) ?? null;
  } catch {
    return null;
  }
}
