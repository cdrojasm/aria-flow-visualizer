import type {
  ApiAgentSettings,
  ApiAnalystConfig,
  ApiClassificationConfig,
  ApiAdversarialConfig,
  ApiDetectorConfig,
  ApiDetectorAdversarialConfig,
  ApiDocumentationConfig,
  ApiExecutorConfig,
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
  type FilterGroup,
  type SegmentAgentConfig,
  type SegmentCode,
  type SegmentMonitoringConfig,
  type SegmentSettings,
  defaultSegmentAgent,
  defaultSegments,
} from "@/data/configs";

// Pure, bijective(-ish) conversion between the frontend's flat camelCase
// ConfigSettings (src/data/configs.ts) and the backend's nested snake_case
// CreateConfigurationRequest/ConfigurationDetailResponse (schemas.py). No
// side effects, no fetch — see configurations.functions.ts for the HTTP
// calls this feeds. segmento (a per-item segment tag on taxonomies/modus
// operandi/flags/example cases) has no frontend field yet; it round-trips
// as "" since nothing in the UI sets it.

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

function agentToApi(a: SegmentAgentConfig): ApiAgentSettings {
  const deterministic = {
    alert_filter: filterGroupToApi(a.deterministic.alertFilter),
    field_enrichment: a.deterministic.fieldEnrichment,
    rules: a.deterministic.rules.map((rule) => ({
      id: rule.id,
      variable: rule.variable,
      comparison: rule.comparison,
      values: rule.values,
      score: rule.score,
      decision: rule.decision,
    })),
  };
  const profiling: ApiProfilingConfig = {
    // fieldEnrichment is already a plain FeatureConfiguration (Recipe/
    // RecipeStep) object - same wire shape backend and frontend share with
    // modelos/, so it travels as-is, no per-item mapping needed.
    field_enrichment: a.profiling.fieldEnrichment,
    strategies: a.profiling.strategies.map((s) => ({
      key: s.key,
      main_prompt: s.mainPrompt,
      main_prompt_vars: s.mainPromptVars,
      main_prompt_mode: s.mainPromptMode,
      // The pandas-history MCP control was retired from Perfilamiento.
      // Always disable legacy saved values when the configuration is saved.
      use_pandas_history_mcp: false,
    })),
  };
  const detector: ApiDetectorConfig = {
    vector_store_tools: a.detector.vectorStoreTools,
    vector_store_version_id: a.detector.vectorStoreVersionId,
    built_in_tools: a.detector.builtInTools,
    enable_pandas_history_tool: a.detector.enablePandasHistoryTool,
    use_xgboost_model: a.detector.useXgboostModel,
    xgboost_model_id: a.detector.xgboostModelId,
    xgboost_fraud_threshold: a.detector.xgboostFraudThreshold,
    xgboost_uncertainty_threshold: a.detector.xgboostUncertaintyThreshold,
    xgboost_shap_enabled: a.detector.xgboostShapEnabled,
    prompt: a.detector.prompt,
    prompt_vars: a.detector.promptVars,
    max_thought_iterations: a.detector.maxThoughtIterations,
  };
  const detectorAdversarial: ApiDetectorAdversarialConfig = {
    prompt: a.detectorAdversarial.prompt,
    prompt_vars: a.detectorAdversarial.promptVars,
    max_cycles: a.detectorAdversarial.maxCycles,
    feed_feedback_to_classification: a.detectorAdversarial.feedFeedbackToClassification,
    max_thought_iterations: a.detectorAdversarial.maxThoughtIterations,
  };
  const classification: ApiClassificationConfig = {
    vector_store_tools: a.classification.vectorStoreTools,
    vector_store_version_id: a.classification.vectorStoreVersionId,
    built_in_tools: a.classification.builtInTools,
    prompt: a.classification.prompt,
    prompt_vars: a.classification.promptVars,
    max_thought_iterations: a.classification.maxThoughtIterations,
  };
  const adversarial: ApiAdversarialConfig = {
    prompt: a.adversarial.prompt,
    prompt_vars: a.adversarial.promptVars,
    max_cycles: a.adversarial.maxCycles,
    feed_feedback_to_classification: a.adversarial.feedFeedbackToClassification,
  };
  const analyst: ApiAnalystConfig = {
    playbooks: a.analyst.playbooks.map((p) => ({
      id: p.id,
      name: p.name,
      strategy: p.strategy,
      resolution_tag: p.resolutionTag,
      resolution_method_id: p.resolutionMethodId,
    })),
  };
  const voicebotCall: ApiVoicebotConfig = {
    base_prompt: a.executor.voicebotCall.basePrompt,
    base_prompt_vars: a.executor.voicebotCall.basePromptVars,
    category_prompts: a.executor.voicebotCall.categoryPrompts.map((c) => ({
      id: c.id,
      taxonomy_id: c.taxonomyId,
      prompt: c.prompt,
    })),
  };
  const documentador: ApiDocumentationConfig = {
    strategy: a.executor.documentador.strategy,
    template: a.executor.documentador.template,
    template_vars: a.executor.documentador.templateVars,
    agent_prompt: a.executor.documentador.agentPrompt,
    agent_prompt_vars: a.executor.documentador.agentPromptVars,
  };
  const executor: ApiExecutorConfig = {
    aric_marking: {
      prompt: a.executor.aricMarking.prompt,
      prompt_vars: a.executor.aricMarking.promptVars,
    },
    voicebot_call: voicebotCall,
    documentador,
    analyst_escalation: {
      prompt: a.executor.analystEscalation.prompt,
      prompt_vars: a.executor.analystEscalation.promptVars,
    },
  };
  return {
    deterministic,
    profiling,
    rubrics: a.rubrics.map((rubric) => ({
      id: rubric.id,
      name: rubric.name,
      conditions: rubric.conditions.map(({ id, variable, comparison, values, score }) => ({
        id,
        variable,
        comparison,
        values,
        score,
      })),
    })),
    detector,
    detector_adversarial: detectorAdversarial,
    classification,
    adversarial,
    analyst,
    executor,
    active_fields: a.activeFields,
    active_model_id: a.activeModelId,
  };
}

function agentFromApi(a: ApiAgentSettings): SegmentAgentConfig {
  // Backwards-compatible while a saved version predates the deterministic
  // configuration contract.
  const defaults = defaultSegmentAgent();
  return {
    deterministic: a.deterministic
      ? {
          alertFilter: filterGroupFromApi(a.deterministic.alert_filter),
          fieldEnrichment: a.deterministic.field_enrichment,
          rules: a.deterministic.rules,
        }
      : defaults.deterministic,
    profiling: {
      fieldEnrichment: a.profiling.field_enrichment,
      strategies: a.profiling.strategies.map((s) => ({
        key: s.key,
        mainPrompt: s.main_prompt,
        mainPromptVars: s.main_prompt_vars,
        mainPromptMode: s.main_prompt_mode,
        usePandasHistoryMcp: false,
      })),
    },
    rubrics: a.rubrics ?? [],
    detector: a.detector
      ? {
          vectorStoreTools: a.detector
            .vector_store_tools as SegmentAgentConfig["detector"]["vectorStoreTools"],
          vectorStoreVersionId: a.detector.vector_store_version_id,
          builtInTools: a.detector.built_in_tools as SegmentAgentConfig["detector"]["builtInTools"],
          enablePandasHistoryTool: a.detector.enable_pandas_history_tool,
          useXgboostModel: a.detector.use_xgboost_model,
          xgboostModelId: a.detector.xgboost_model_id,
          xgboostFraudThreshold:
            a.detector.xgboost_fraud_threshold ?? defaults.detector.xgboostFraudThreshold,
          xgboostUncertaintyThreshold:
            a.detector.xgboost_uncertainty_threshold ??
            defaults.detector.xgboostUncertaintyThreshold,
          xgboostShapEnabled:
            a.detector.xgboost_shap_enabled ?? defaults.detector.xgboostShapEnabled,
          prompt: a.detector.prompt,
          promptVars: a.detector.prompt_vars,
          maxThoughtIterations:
            a.detector.max_thought_iterations ?? defaults.detector.maxThoughtIterations,
        }
      : defaults.detector,
    detectorAdversarial: a.detector_adversarial
      ? {
          prompt: a.detector_adversarial.prompt,
          promptVars: a.detector_adversarial.prompt_vars,
          maxCycles: a.detector_adversarial.max_cycles,
          feedFeedbackToClassification: a.detector_adversarial.feed_feedback_to_classification,
          maxThoughtIterations: a.detector_adversarial.max_thought_iterations,
        }
      : defaults.detectorAdversarial,
    classification: {
      vectorStoreTools: a.classification
        .vector_store_tools as SegmentAgentConfig["classification"]["vectorStoreTools"],
      vectorStoreVersionId: a.classification.vector_store_version_id ?? null,
      builtInTools: a.classification
        .built_in_tools as SegmentAgentConfig["classification"]["builtInTools"],
      prompt: a.classification.prompt,
      promptVars: a.classification.prompt_vars,
      maxThoughtIterations: a.classification.max_thought_iterations ?? 5,
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
    },
    executor: a.executor
      ? {
          aricMarking: {
            prompt: a.executor.aric_marking.prompt,
            promptVars: a.executor.aric_marking.prompt_vars,
          },
          voicebotCall: {
            basePrompt: a.executor.voicebot_call.base_prompt,
            basePromptVars: a.executor.voicebot_call.base_prompt_vars,
            categoryPrompts: a.executor.voicebot_call.category_prompts.map((c) => ({
              id: c.id,
              taxonomyId: c.taxonomy_id,
              prompt: c.prompt,
            })),
          },
          documentador: {
            strategy: a.executor.documentador.strategy,
            template: a.executor.documentador.template,
            templateVars: a.executor.documentador.template_vars,
            agentPrompt: a.executor.documentador.agent_prompt,
            agentPromptVars: a.executor.documentador.agent_prompt_vars,
          },
          analystEscalation: {
            prompt: a.executor.analyst_escalation.prompt,
            promptVars: a.executor.analyst_escalation.prompt_vars,
          },
        }
      : defaults.executor,
    activeFields: a.active_fields,
    activeModelId: a.active_model_id,
  };
}

function segmentToApi(s: SegmentSettings): ApiSegmentSettings {
  return {
    enabled: s.enabled,
    filter: filterGroupToApi(s.filter),
    monitoring: monitoringToApi(s.monitoring),
    agent: agentToApi(s.agent),
    order: s.order,
  };
}
function segmentFromApi(s: ApiSegmentSettings): SegmentSettings {
  return {
    enabled: s.enabled,
    filter: filterGroupFromApi(s.filter),
    monitoring: monitoringFromApi(s.monitoring),
    agent: agentFromApi(s.agent),
    order: s.order,
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
      migration_window_datetime: settings.migrationWindowDatetime,
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
      queue_rule_filter_mode: settings.queueRuleFilterMode,
      queue_allowed_triggered_rules: settings.queueAllowedTriggeredRules,
      queue_discard_behavior: {
        resolution_tag: settings.queueDiscardBehavior.resolutionTag,
        resolution_method_id: settings.queueDiscardBehavior.resolutionMethodId ?? null,
      },
      voicebot_shortage_behavior: {
        resolution_tag: settings.voicebotShortageBehavior.resolutionTag,
        resolution_method_id: settings.voicebotShortageBehavior.resolutionMethodId ?? null,
      },
      analyst_shortage_behavior: {
        resolution_tag: settings.analystShortageBehavior.resolutionTag,
        resolution_method_id: settings.analystShortageBehavior.resolutionMethodId ?? null,
      },
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
    migrationWindowDatetime: detail.general.migration_window_datetime,
    analystEscalationEnabled: detail.general.analyst_escalation_enabled,
    voicebotEscalationEnabled: detail.general.voicebot_escalation_enabled,
    maxInstances: detail.infra.max_instances,
    autoScale: detail.infra.auto_scale,
    fraudHistoryDbRetentionDays: detail.infra.fraud_history_db_retention_days,
    fraudHistoryColdStorageRetentionMonths:
      detail.infra.fraud_history_cold_storage_retention_months,
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
    queueRuleFilterMode: detail.ops.queue_rule_filter_mode,
    queueAllowedTriggeredRules: detail.ops.queue_allowed_triggered_rules,
    queueDiscardBehavior: {
      resolutionTag: detail.ops.queue_discard_behavior.resolution_tag,
      resolutionMethodId: detail.ops.queue_discard_behavior.resolution_method_id,
    },
    voicebotShortageBehavior: {
      resolutionTag: detail.ops.voicebot_shortage_behavior.resolution_tag,
      resolutionMethodId: detail.ops.voicebot_shortage_behavior.resolution_method_id,
    },
    analystShortageBehavior: {
      resolutionTag: detail.ops.analyst_shortage_behavior.resolution_tag,
      resolutionMethodId: detail.ops.analyst_shortage_behavior.resolution_method_id,
    },
    maxTestInstances: detail.test.max_test_instances,
    maxConcurrentExperiments: detail.test.max_concurrent_experiments,
    experimentTimeoutMinutes: detail.test.experiment_timeout_minutes,
    maxStoredTestRuns: detail.test.max_stored_test_runs,
    testCleanupPolicy: detail.test.test_cleanup_policy,
    segments,
  };
}
