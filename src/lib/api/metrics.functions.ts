import { apiFetch } from "./client";

// Client functions wrapping the backend's metrics API (../backend, base
// path /api/v0/metrics - see src/infrastructure/entrypoint/api/routers/
// metrics_router.py). The Api* types are a field-for-field mirror of
// backend/src/infrastructure/entrypoint/api/schemas.py's "Metrics (A2)"
// section (snake_case, as the wire format is). Every number is a sum of
// additive rollup measures: rates/averages are numerator / denominator,
// computed on the client (see metricsMapping.ts) - never averaged twice.

// --- Wire types (snake_case, mirrors schemas.py) --------------------------

export type ApiMaturation = "maturing" | "may_vary" | "stable";
export type ApiRollupLevel = "day" | "month" | "year";
export type ApiResolutionMethod = "aria" | "analyst" | "voicebot" | "bidi" | "unknown";
export type ApiAlertStatus =
  "RECEIVED" | "PROCESSING" | "ESCALATED" | "CLOSED" | "SKIPPED" | "FAILED";

// MetricsRangeSchema (`from` is aliased on the wire).
export type ApiMetricsRange = {
  from: string;
  to: string;
  timezone: string;
  amount_tier_set_versions: string[];
};

// MetricsPeriodSchema
export type ApiMetricsPeriod = {
  level: ApiRollupLevel;
  period: string;
  period_start: string;
  period_end: string;
  hours: number[];
  partial: boolean;
  maturation: ApiMaturation;
  alerts: number;
  amount_sum: number;
  decided: number;
  false_positives: number;
  undetected_fraud: number;
  reviewed: number;
};

// MetricsWarningSchema
export type ApiMetricsWarningCode =
  "partial_period" | "amount_tier_set_changed" | "fraud_label_maturing";
export type ApiMetricsWarning = {
  code: ApiMetricsWarningCode;
  message: string;
  periods: string[];
};

// HistogramBucketSchema
export type ApiHistogramBucket = {
  bucket: string;
  upper_bound_seconds: number | null;
  count: number;
};

// ResolutionTimeStatsSchema
export type ApiResolutionTimeStats = {
  count: number;
  sum_seconds: number;
  within_sla_count: number;
  histogram: ApiHistogramBucket[];
};

// FraudQualityStatsSchema
export type ApiFraudQualityStats = {
  decided: number;
  pending: number;
  true_positives: number;
  true_negatives: number;
  false_positives: number;
  undetected_fraud: number;
  true_positive_amount_sum: number;
  false_positive_amount_sum: number;
  undetected_fraud_amount_sum: number;
  reviewed: number;
  reviewed_changed: number;
  reviewed_confirmed: number;
  review_events: number;
  maturation_histogram: ApiHistogramBucket[];
};

// DimensionBucketSchema
export type ApiDimensionBucket = {
  value: string;
  alerts: number;
  amount_sum: number;
  amount_count: number;
  decided: number;
  false_positives: number;
  undetected_fraud: number;
};

// HourlyProfileSlotSchema
export type ApiHourlyProfileSlot = {
  hour: number;
  alerts: number;
  amount_sum: number;
  resolution_time_count: number;
  resolution_time_sum_seconds: number;
  within_sla_count: number;
};

// MetricsTotalsSchema
export type ApiMetricsTotals = {
  alerts: number;
  amount_sum: number;
  amount_count: number;
};

// MetricsOverviewResponse
export type ApiMetricsOverview = {
  range: ApiMetricsRange;
  periods: ApiMetricsPeriod[];
  warnings: ApiMetricsWarning[];
  totals: ApiMetricsTotals;
  funnel_by_status: ApiDimensionBucket[];
  fraud_quality: ApiFraudQualityStats;
  resolution_time: ApiResolutionTimeStats;
  // Keyed by ALERT_DIMENSIONS (origin, segment, channel, subchannel,
  // amount_tier, amount_tier_set_version, status, configuration_id,
  // resolution_method, mark, fraud_label).
  distributions: Record<string, ApiDimensionBucket[]>;
  hourly_profile: ApiHourlyProfileSlot[];
};

// ResolutionMethodStatsSchema
export type ApiResolutionMethodStats = {
  resolution_method: ApiResolutionMethod;
  alerts: number;
  fraud_marks: number;
  no_fraud_marks: number;
  fraud_quality: ApiFraudQualityStats;
  resolution_time: ApiResolutionTimeStats;
};

// RecommendationAcceptanceSchema
export type ApiRecommendationAcceptance = {
  available: boolean;
  accepted: number | null;
  ignored: number | null;
  reason: string;
};

// AgentMetricsResponse
export type ApiAgentMetrics = {
  range: ApiMetricsRange;
  periods: ApiMetricsPeriod[];
  warnings: ApiMetricsWarning[];
  totals: ApiMetricsTotals;
  by_resolution_method: ApiResolutionMethodStats[];
  fraud_quality: ApiFraudQualityStats;
  resolution_time: ApiResolutionTimeStats;
  hourly_profile: ApiHourlyProfileSlot[];
  recommendations: ApiRecommendationAcceptance;
};

// DurationStatsSchema
export type ApiDurationStats = {
  count: number;
  sum_seconds: number;
  histogram: ApiHistogramBucket[];
};

// WorkflowStepStatsSchema
export type ApiWorkflowStepStats = {
  step_name: string;
  executions: number;
  succeeded: number;
  failed: number;
  retries: number;
  duration: ApiDurationStats;
};

// LLMCallStatsSchema
export type ApiLLMCallStats = {
  model: string;
  calls: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
  latency: ApiDurationStats;
};

// ResearchCallStatsSchema
export type ApiResearchCallStats = {
  source: string;
  calls: number;
  ok: number;
  failed: number;
  timeout: number;
};

// EvaluationStatsSchema (sampled LLM-judge over finished alerts).
export type ApiEvaluationStats = {
  evaluated: number;
  hallucinations: number;
  data_use_correct: number;
  invalid: number;
};

// TechnicalHourSlotSchema
export type ApiTechnicalHourSlot = {
  hour: number;
  step_executions: number;
  step_failed: number;
  step_duration_sum_seconds: number;
  step_duration_count: number;
  llm_calls: number;
  llm_errors: number;
  input_tokens: number;
  output_tokens: number;
  research_calls: number;
  research_failed: number;
  research_timeout: number;
};

// TechnicalPeriodSchema
export type ApiTechnicalPeriod = {
  level: ApiRollupLevel;
  period: string;
  period_start: string;
  period_end: string;
  hours: number[];
  partial: boolean;
  maturation: ApiMaturation;
  step_executions: number;
  step_failed: number;
  llm_calls: number;
  llm_errors: number;
  input_tokens: number;
  output_tokens: number;
  research_calls: number;
  evaluated: number;
  hallucinations: number;
  data_use_correct: number;
};

// TechnicalMetricsResponse
export type ApiTechnicalMetrics = {
  range: ApiMetricsRange;
  periods: ApiTechnicalPeriod[];
  warnings: ApiMetricsWarning[];
  workflow_steps: ApiWorkflowStepStats;
  workflow_steps_by_step: ApiWorkflowStepStats[];
  llm_calls: ApiLLMCallStats;
  llm_calls_by_model: ApiLLMCallStats[];
  research_calls: ApiResearchCallStats;
  research_calls_by_source: ApiResearchCallStats[];
  evaluations: ApiEvaluationStats;
  hourly_profile: ApiTechnicalHourSlot[];
};

// LiveAlertFunnelResponse (R9 "Tiempo real"): current counts, not a rollup.
export type ApiLiveAlertFunnel = {
  received: number;
  processing: number;
  escalated: number;
  voicebot_in_call: number;
  measured_at: string;
};

// --- Query ------------------------------------------------------------------

// Filters accepted by /metrics/* and /alerts/history (metrics_query_params.py);
// each is repeatable on the wire (?channel=A&channel=B = either). step_name
// and model only apply to /metrics/technical.
export const METRICS_FILTER_DIMENSIONS = [
  "segment",
  "channel",
  "subchannel",
  "amount_tier",
  "status",
  "configuration_id",
  "resolution_method",
] as const;
export type MetricsFilterDimension = (typeof METRICS_FILTER_DIMENSIONS)[number];
export type MetricsFilters = Partial<
  Record<MetricsFilterDimension | "step_name" | "model", string[]>
>;

// `from`/`to` are ISO datetimes; one without an offset is read in the
// operations timezone (America/Bogota). Omitted = the last 24 h. The range
// is half-open [from, to).
export type MetricsQuery = {
  from?: string;
  to?: string;
  filters?: MetricsFilters;
};

export function metricsSearchParams(query: MetricsQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  for (const [name, values] of Object.entries(query.filters ?? {})) {
    for (const value of values ?? []) if (value) params.append(name, value);
  }
  return params;
}

function withQuery(path: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function getMetricsOverview({ data }: { data: MetricsQuery }): Promise<ApiMetricsOverview> {
  return apiFetch(withQuery("/api/v0/metrics/overview", metricsSearchParams(data)));
}

export function getAgentMetrics({ data }: { data: MetricsQuery }): Promise<ApiAgentMetrics> {
  return apiFetch(withQuery("/api/v0/metrics/agent", metricsSearchParams(data)));
}

export function getTechnicalMetrics({
  data,
}: {
  data: MetricsQuery;
}): Promise<ApiTechnicalMetrics> {
  return apiFetch(withQuery("/api/v0/metrics/technical", metricsSearchParams(data)));
}

export function getLiveAlertFunnel(): Promise<ApiLiveAlertFunnel> {
  return apiFetch("/api/v0/metrics/live");
}
