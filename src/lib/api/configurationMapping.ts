import type {
  ApiAgentSettings,
  ApiAnalystConfig,
  ApiClassificationConfig,
  ApiAdversarialConfig,
  ApiDocumentationConfig,
  ApiFieldCategorization,
  ApiFieldCriterion,
  ApiFilterGroup,
  ApiMonitoringSettings,
  ApiProfilingConfig,
  ApiSegmentSettings,
  ApiVoicebotConfig,
  ConfigurationDetailResponse,
  CreateConfigurationRequest,
} from "./configurations.functions";
import {
  type ConfigSettings,
  type FieldCategorization,
  type FieldCriterion,
  type FilterGroup,
  type SegmentAgentConfig,
  type SegmentCode,
  type SegmentMonitoringConfig,
  type SegmentSettings,
  defaultSegments,
} from "@/data/configs";

// Pure, bijective(-ish) conversion between the frontend's flat camelCase
// ConfigSettings (src/data/configs.ts) and the backend's nested snake_case
// CreateConfigurationRequest/ConfigurationDetailResponse (schemas.py). No
// side effects, no fetch — see configurations.functions.ts for the HTTP
// calls this feeds. segmento (a per-item segment tag on taxonomies/modus
// operandi/flags/example cases) has no frontend field yet; it round-trips
// as "" since nothing in the UI sets it.

const hourToClock = (hour: number): string => `${String(hour).padStart(2, "0")}:00`;
const clockToHour = (clock: string): number => Number(clock.split(":")[0]) || 0;

function filterGroupToApi(g: FilterGroup): ApiFilterGroup {
  return {
    id: g.id,
    operator: g.operator,
    conditions: g.conditions.map((c) => ({
      id: c.id,
      category: c.category,
      operator: c.operator,
      values: c.values,
    })),
    groups: g.groups.map(filterGroupToApi),
  };
}
function filterGroupFromApi(g: ApiFilterGroup): FilterGroup {
  return {
    id: g.id,
    operator: g.operator,
    conditions: g.conditions.map((c) => ({
      id: c.id,
      category: c.category,
      operator: c.operator,
      values: c.values,
    })),
    groups: g.groups.map(filterGroupFromApi),
  };
}

function monitoringToApi(m: SegmentMonitoringConfig): ApiMonitoringSettings {
  return {
    sampling_interval_value: m.samplingIntervalValue,
    sampling_interval_unit: m.samplingIntervalUnit,
    sampling_criteria: m.samplingCriteria,
    max_samples: m.maxSamples,
    prompt_clasificacion: m.promptClasificacion,
    prompt_clasificacion_vars: m.promptClasificacionVars,
    prompt_analista: m.promptAnalista,
    prompt_analista_vars: m.promptAnalistaVars,
    prompt_monitoreo: m.promptMonitoreo,
    prompt_monitoreo_vars: m.promptMonitoreoVars,
  };
}
function monitoringFromApi(m: ApiMonitoringSettings): SegmentMonitoringConfig {
  return {
    samplingIntervalValue: m.sampling_interval_value,
    samplingIntervalUnit: m.sampling_interval_unit,
    samplingCriteria: m.sampling_criteria,
    maxSamples: m.max_samples,
    promptClasificacion: m.prompt_clasificacion,
    promptClasificacionVars: m.prompt_clasificacion_vars,
    promptAnalista: m.prompt_analista,
    promptAnalistaVars: m.prompt_analista_vars,
    promptMonitoreo: m.prompt_monitoreo,
    promptMonitoreoVars: m.prompt_monitoreo_vars,
  };
}

function fieldCriterionToApi(c: FieldCriterion): ApiFieldCriterion {
  return {
    id: c.id,
    mode: c.mode,
    output: c.output,
    min_value: c.minValue ?? null,
    max_value: c.maxValue ?? null,
    operator: c.operator ?? null,
    numeric_value: c.numericValue ?? null,
    text_value: c.textValue ?? null,
    values: c.values,
  };
}
function fieldCriterionFromApi(c: ApiFieldCriterion): FieldCriterion {
  return {
    id: c.id,
    mode: c.mode,
    output: c.output,
    minValue: c.min_value ?? undefined,
    maxValue: c.max_value ?? undefined,
    operator: c.operator ?? undefined,
    numericValue: c.numeric_value ?? undefined,
    textValue: c.text_value ?? undefined,
    values: c.values,
  };
}
function fieldCategorizationToApi(fc: FieldCategorization): ApiFieldCategorization {
  return { field: fc.field, kind: fc.kind, criteria: fc.criteria.map(fieldCriterionToApi) };
}
function fieldCategorizationFromApi(fc: ApiFieldCategorization): FieldCategorization {
  return { field: fc.field, kind: fc.kind, criteria: fc.criteria.map(fieldCriterionFromApi) };
}

function agentToApi(a: SegmentAgentConfig): ApiAgentSettings {
  const profiling: ApiProfilingConfig = {
    field_categorizations: a.profiling.fieldCategorizations.map(fieldCategorizationToApi),
    strategies: a.profiling.strategies.map((s) => ({
      key: s.key,
      main_prompt: s.mainPrompt,
      main_prompt_vars: s.mainPromptVars,
      categorization_prompt: s.categorizationPrompt,
      categorization_prompt_vars: s.categorizationPromptVars,
      produced_variables: s.producedVariables,
      use_pandas_history_mcp: s.usePandasHistoryMcp,
    })),
  };
  const classification: ApiClassificationConfig = {
    vector_store_tools: a.classification.vectorStoreTools,
    built_in_tools: a.classification.builtInTools,
    prompt: a.classification.prompt,
    prompt_vars: a.classification.promptVars,
  };
  const adversarial: ApiAdversarialConfig = {
    prompt: a.adversarial.prompt,
    prompt_vars: a.adversarial.promptVars,
    max_cycles: a.adversarial.maxCycles,
    feed_feedback_to_classification: a.adversarial.feedFeedbackToClassification,
  };
  const voicebot: ApiVoicebotConfig = {
    base_prompt: a.analyst.voicebot.basePrompt,
    base_prompt_vars: a.analyst.voicebot.basePromptVars,
    category_prompts: a.analyst.voicebot.categoryPrompts.map((c) => ({
      id: c.id,
      taxonomy_id: c.taxonomyId,
      prompt: c.prompt,
    })),
  };
  const analyst: ApiAnalystConfig = {
    playbooks: a.analyst.playbooks.map((p) => ({
      id: p.id,
      name: p.name,
      strategy: p.strategy,
      resolution_tag: p.resolutionTag,
      resolution_method_id: p.resolutionMethodId,
    })),
    voicebot,
  };
  const documentation: ApiDocumentationConfig = {
    strategy: a.documentation.strategy,
    template: a.documentation.template,
    template_vars: a.documentation.templateVars,
    agent_prompt: a.documentation.agentPrompt,
    agent_prompt_vars: a.documentation.agentPromptVars,
  };
  return {
    profiling,
    classification,
    adversarial,
    analyst,
    documentation,
    taxonomies: a.taxonomies.map((t) => ({ ...t, segmento: "" })),
    modus_operandi: a.modusOperandi.map((m) => ({
      id: m.id,
      title: m.title,
      narrative: m.narrative,
      taxonomy_id: m.taxonomyId,
      evolved_variables: m.evolvedVariables,
      active: m.active,
      segmento: "",
    })),
    flags: a.flags.map((f) => ({
      id: f.id,
      flag_type: f.flagType,
      name: f.name,
      description: f.description,
      evolved_variables: f.evolvedVariables,
      modus_operandi_ids: f.modusOperandiIds,
      segmento: "",
    })),
    example_cases: a.similarCases.map((c) => ({
      id: c.id,
      text: c.text,
      modus_operandi_id: c.modusOperandiId,
      taxonomy_id: c.taxonomyId,
      segmento: "",
    })),
    active_fields: a.activeFields,
  };
}

function agentFromApi(a: ApiAgentSettings): SegmentAgentConfig {
  return {
    profiling: {
      fieldCategorizations: a.profiling.field_categorizations.map(fieldCategorizationFromApi),
      strategies: a.profiling.strategies.map((s) => ({
        key: s.key,
        mainPrompt: s.main_prompt,
        mainPromptVars: s.main_prompt_vars,
        categorizationPrompt: s.categorization_prompt,
        categorizationPromptVars: s.categorization_prompt_vars,
        producedVariables: s.produced_variables,
        usePandasHistoryMcp: s.use_pandas_history_mcp,
      })),
    },
    classification: {
      vectorStoreTools: a.classification
        .vector_store_tools as SegmentAgentConfig["classification"]["vectorStoreTools"],
      builtInTools: a.classification
        .built_in_tools as SegmentAgentConfig["classification"]["builtInTools"],
      prompt: a.classification.prompt,
      promptVars: a.classification.prompt_vars,
    },
    adversarial: {
      prompt: a.adversarial.prompt,
      promptVars: a.adversarial.prompt_vars,
      maxCycles: a.adversarial.max_cycles,
      feedFeedbackToClassification: a.adversarial.feed_feedback_to_classification,
    },
    analyst: {
      playbooks: a.analyst.playbooks.map((p) => ({
        id: p.id,
        name: p.name,
        strategy: p.strategy,
        resolutionTag: p.resolution_tag,
        resolutionMethodId: p.resolution_method_id ?? undefined,
      })),
      voicebot: {
        basePrompt: a.analyst.voicebot.base_prompt,
        basePromptVars: a.analyst.voicebot.base_prompt_vars,
        categoryPrompts: a.analyst.voicebot.category_prompts.map((c) => ({
          id: c.id,
          taxonomyId: c.taxonomy_id,
          prompt: c.prompt,
        })),
      },
    },
    documentation: {
      strategy: a.documentation.strategy,
      template: a.documentation.template,
      templateVars: a.documentation.template_vars,
      agentPrompt: a.documentation.agent_prompt,
      agentPromptVars: a.documentation.agent_prompt_vars,
    },
    taxonomies: a.taxonomies.map(({ segmento: _segmento, ...t }) => t),
    modusOperandi: a.modus_operandi.map((m) => ({
      id: m.id,
      title: m.title,
      narrative: m.narrative,
      taxonomyId: m.taxonomy_id,
      evolvedVariables: m.evolved_variables,
      active: m.active,
    })),
    flags: a.flags.map((f) => ({
      id: f.id,
      flagType: f.flag_type,
      name: f.name,
      description: f.description,
      evolvedVariables: f.evolved_variables,
      modusOperandiIds: f.modus_operandi_ids,
    })),
    similarCases: a.example_cases.map((c) => ({
      id: c.id,
      text: c.text,
      modusOperandiId: c.modus_operandi_id,
      taxonomyId: c.taxonomy_id,
    })),
    activeFields: a.active_fields,
  };
}

function segmentToApi(s: SegmentSettings): ApiSegmentSettings {
  return {
    enabled: s.enabled,
    filter: filterGroupToApi(s.filter),
    monitoring: monitoringToApi(s.monitoring),
    agent: agentToApi(s.agent),
  };
}
function segmentFromApi(s: ApiSegmentSettings): SegmentSettings {
  return {
    enabled: s.enabled,
    filter: filterGroupFromApi(s.filter),
    monitoring: monitoringFromApi(s.monitoring),
    agent: agentFromApi(s.agent),
  };
}

export function toCreateConfigurationRequest(
  settings: ConfigSettings,
  opts: {
    name: string;
    description: string;
    configurationId: string | null;
    basedOnVersion?: number | null;
    createdBy?: string | null;
  },
): CreateConfigurationRequest {
  const segments: Record<string, ApiSegmentSettings> = {};
  for (const [code, segment] of Object.entries(settings.segments)) {
    segments[code] = segmentToApi(segment);
  }
  return {
    name: opts.name,
    configuration_id: opts.configurationId,
    based_on_version: opts.basedOnVersion ?? null,
    description: opts.description,
    general: {
      agent_enabled: settings.agentEnabled,
      migration_window_enabled: settings.migrationWindowEnabled,
      migration_window_hour: clockToHour(settings.migrationWindowHour),
      analyst_escalation_enabled: settings.analystEscalationEnabled,
      voicebot_escalation_enabled: settings.voicebotEscalationEnabled,
    },
    infra: {
      max_instances: settings.maxInstances,
      auto_scale: settings.autoScale,
      fraud_history_db_retention_days: settings.fraudHistoryDbRetentionDays,
      fraud_history_cold_storage_retention_months: settings.fraudHistoryColdStorageRetentionMonths,
    },
    ops: {
      voicebot_max_concurrent_calls: settings.voicebotMaxConcurrentCalls,
      analyst_capacity: {
        profiles: settings.analystCapacity.profiles,
        default_profile_id: settings.analystCapacity.defaultProfileId,
        day_overrides: settings.analystCapacity.dayOverrides as Record<string, string>,
      },
      queue_max_lifetime_value: settings.queueMaxLifetimeValue,
      queue_max_lifetime_unit: settings.queueMaxLifetimeUnit,
      queue_discard_amount_threshold: settings.queueDiscardAmountThreshold,
      queue_rule_filter_enabled: settings.queueRuleFilterEnabled,
      queue_allowed_triggered_rules: settings.queueAllowedTriggeredRules,
      voicebot_shortage_behavior: { action: settings.voicebotShortageBehavior.action },
      analyst_shortage_behavior: { action: settings.analystShortageBehavior.action },
    },
    test: {
      max_test_instances: settings.maxTestInstances,
      max_concurrent_experiments: settings.maxConcurrentExperiments,
      experiment_timeout_minutes: settings.experimentTimeoutMinutes,
      max_stored_test_runs: settings.maxStoredTestRuns,
      test_cleanup_policy: settings.testCleanupPolicy,
    },
    created_by: opts.createdBy ?? null,
    segments,
  };
}

export function settingsFromConfigurationDetail(
  detail: ConfigurationDetailResponse,
): ConfigSettings {
  const segments = defaultSegments();
  for (const [code, segment] of Object.entries(detail.segments)) {
    segments[code as SegmentCode] = segmentFromApi(segment);
  }
  return {
    agentEnabled: detail.general.agent_enabled,
    migrationWindowEnabled: detail.general.migration_window_enabled,
    migrationWindowHour: hourToClock(detail.general.migration_window_hour),
    analystEscalationEnabled: detail.general.analyst_escalation_enabled,
    voicebotEscalationEnabled: detail.general.voicebot_escalation_enabled,
    maxInstances: detail.infra.max_instances,
    autoScale: detail.infra.auto_scale,
    fraudHistoryDbRetentionDays: detail.infra.fraud_history_db_retention_days,
    fraudHistoryColdStorageRetentionMonths: detail.infra.fraud_history_cold_storage_retention_months,
    voicebotMaxConcurrentCalls: detail.ops.voicebot_max_concurrent_calls,
    analystCapacity: {
      profiles: detail.ops.analyst_capacity.profiles,
      defaultProfileId: detail.ops.analyst_capacity.default_profile_id,
      dayOverrides: detail.ops.analyst_capacity.day_overrides as Record<number, string>,
    },
    queueMaxLifetimeValue: detail.ops.queue_max_lifetime_value,
    queueMaxLifetimeUnit: detail.ops.queue_max_lifetime_unit,
    queueDiscardAmountThreshold: detail.ops.queue_discard_amount_threshold,
    queueRuleFilterEnabled: detail.ops.queue_rule_filter_enabled,
    queueAllowedTriggeredRules: detail.ops.queue_allowed_triggered_rules,
    voicebotShortageBehavior: { action: detail.ops.voicebot_shortage_behavior.action },
    analystShortageBehavior: { action: detail.ops.analyst_shortage_behavior.action },
    maxTestInstances: detail.test.max_test_instances,
    maxConcurrentExperiments: detail.test.max_concurrent_experiments,
    experimentTimeoutMinutes: detail.test.experiment_timeout_minutes,
    maxStoredTestRuns: detail.test.max_stored_test_runs,
    testCleanupPolicy: detail.test.test_cleanup_policy,
    segments,
  };
}
