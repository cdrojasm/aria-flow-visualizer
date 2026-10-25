import type {
  ApiAgentSettings,
  ApiDelegatedResearchSettings,
  ApiResearchAgentConfig,
  ApiToolPickerFields,
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
  type DelegatedResearchSettings,
  type ResearchAgentConfig,
  type ToolPickerFields,
  type FilterGroup,
  type SegmentAgentConfig,
  type SegmentCode,
  type SegmentMonitoringConfig,
  type SegmentSettings,
  defaultSegmentAgent,
  defaultSegments,
} from "@/data/configs";

function researchToApi(research: DelegatedResearchSettings): ApiDelegatedResearchSettings {
  const base = (v: ResearchAgentConfig) => ({
    enabled: v.enabled,
    max_delegations: v.maxDelegations,
    timeout_seconds: v.timeoutSeconds,
    max_result_items: v.maxResultItems,
  });
  return {
    vector_store: {
      ...base(research.vectorStore),
      vector_store_instance_id: research.vectorStore.vectorStoreInstanceId,
      similarity_threshold: research.vectorStore.similarityThreshold,
      max_documents_per_query: research.vectorStore.maxDocumentsPerQuery,
      allowed_asset_types: research.vectorStore.allowedAssetTypes,
    },
    history_pandas: {
      ...base(research.historyPandas),
      max_history_rows: research.historyPandas.maxHistoryRows,
      window_days: research.historyPandas.windowDays,
      max_analysis_operations: research.historyPandas.maxAnalysisOperations,
      allowed_columns: research.historyPandas.allowedColumns,
      allowed_operations: research.historyPandas.allowedOperations,
    },
  };
}

function researchFromApi(
  research: Partial<ApiDelegatedResearchSettings> | undefined,
  fallback: DelegatedResearchSettings,
): DelegatedResearchSettings {
  if (!research) return fallback;
  const base = (
    v: Partial<ApiResearchAgentConfig> | undefined,
    d: ResearchAgentConfig,
  ): ResearchAgentConfig => ({
    enabled: v?.enabled ?? d.enabled,
    maxDelegations: v?.max_delegations ?? d.maxDelegations,
    timeoutSeconds: v?.timeout_seconds ?? d.timeoutSeconds,
    maxResultItems: v?.max_result_items ?? d.maxResultItems,
  });
  const vs = research.vector_store;
  const hp = research.history_pandas;
  return {
    vectorStore: {
      ...base(vs, fallback.vectorStore),
      vectorStoreInstanceId: vs?.vector_store_instance_id ?? null,
      similarityThreshold: vs?.similarity_threshold ?? fallback.vectorStore.similarityThreshold,
      maxDocumentsPerQuery:
        vs?.max_documents_per_query ?? fallback.vectorStore.maxDocumentsPerQuery,
      allowedAssetTypes: vs?.allowed_asset_types ?? fallback.vectorStore.allowedAssetTypes,
    },
    historyPandas: {
      ...base(hp, fallback.historyPandas),
      maxHistoryRows: hp?.max_history_rows ?? fallback.historyPandas.maxHistoryRows,
      windowDays: hp?.window_days ?? fallback.historyPandas.windowDays,
      maxAnalysisOperations:
        hp?.max_analysis_operations ?? fallback.historyPandas.maxAnalysisOperations,
      allowedColumns: hp?.allowed_columns ?? fallback.historyPandas.allowedColumns,
      allowedOperations: hp?.allowed_operations ?? fallback.historyPandas.allowedOperations,
    },
  };
}

// The shared "Herramientas del agente" block - same wire shape for
// Detector, both Adversarials and Clasificación.
function toolsToApi(t: ToolPickerFields): ApiToolPickerFields {
  return {
    watchlist_enabled: t.watchlistEnabled,
    watchlist_ids: t.watchlistIds,
    watchlist_compare_field: t.watchlistCompareField,
    calculator_enabled: t.calculatorEnabled,
    use_xgboost_model: t.useXgboostModel,
    xgboost_model_id: t.xgboostModelId,
    xgboost_fraud_threshold: t.xgboostFraudThreshold,
    xgboost_uncertainty_threshold: t.xgboostUncertaintyThreshold,
    xgboost_shap_enabled: t.xgboostShapEnabled,
    delegated_research: researchToApi(t.delegatedResearch),
  };
}

function toolsFromApi(t: Partial<ApiToolPickerFields>, d: ToolPickerFields): ToolPickerFields {
  return {
    watchlistEnabled: t.watchlist_enabled ?? d.watchlistEnabled,
    watchlistIds: t.watchlist_ids ?? d.watchlistIds,
    watchlistCompareField: t.watchlist_compare_field ?? d.watchlistCompareField,
    calculatorEnabled: t.calculator_enabled ?? d.calculatorEnabled,
    useXgboostModel: t.use_xgboost_model ?? d.useXgboostModel,
    xgboostModelId: t.xgboost_model_id ?? d.xgboostModelId,
    xgboostFraudThreshold: t.xgboost_fraud_threshold ?? d.xgboostFraudThreshold,
    xgboostUncertaintyThreshold: t.xgboost_uncertainty_threshold ?? d.xgboostUncertaintyThreshold,
    xgboostShapEnabled: t.xgboost_shap_enabled ?? d.xgboostShapEnabled,
    delegatedResearch: researchFromApi(t.delegated_research, d.delegatedResearch),
  };
}

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
      aric_action: rule.aricAction,
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
    ...toolsToApi(a.detector),
    prompt: a.detector.prompt,
    prompt_vars: a.detector.promptVars,
    max_thought_iterations: a.detector.maxThoughtIterations,
    output_labels: a.detector.outputLabels,
  };
  const detectorAdversarial: ApiDetectorAdversarialConfig = {
    ...toolsToApi(a.detectorAdversarial),
    prompt: a.detectorAdversarial.prompt,
    prompt_vars: a.detectorAdversarial.promptVars,
    max_cycles: a.detectorAdversarial.maxCycles,
    feed_feedback_to_classification: a.detectorAdversarial.feedFeedbackToClassification,
    max_thought_iterations: a.detectorAdversarial.maxThoughtIterations,
  };
  const classification: ApiClassificationConfig = {
    ...toolsToApi(a.classification),
    prompt: a.classification.prompt,
    prompt_vars: a.classification.promptVars,
    max_thought_iterations: a.classification.maxThoughtIterations,
    output_labels: a.classification.outputLabels,
  };
  const adversarial: ApiAdversarialConfig = {
    ...toolsToApi(a.adversarial),
    prompt: a.adversarial.prompt,
    prompt_vars: a.adversarial.promptVars,
    max_cycles: a.adversarial.maxCycles,
    feed_feedback_to_classification: a.adversarial.feedFeedbackToClassification,
  };
  const analyst: ApiAnalystConfig = {
    prompt: a.analyst.prompt,
    prompt_vars: a.analyst.promptVars,
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
          rules: a.deterministic.rules.map((rule) => ({
            ...rule,
            aricAction: rule.aric_action ?? "soft_block",
          })),
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
          ...toolsFromApi(a.detector, defaults.detector),
          prompt: a.detector.prompt,
          promptVars: a.detector.prompt_vars,
          maxThoughtIterations:
            a.detector.max_thought_iterations ?? defaults.detector.maxThoughtIterations,
          outputLabels: a.detector.output_labels ?? defaults.detector.outputLabels,
        }
      : defaults.detector,
    detectorAdversarial: a.detector_adversarial
      ? {
          ...toolsFromApi(a.detector_adversarial, defaults.detectorAdversarial),
          prompt: a.detector_adversarial.prompt,
          promptVars: a.detector_adversarial.prompt_vars,
          maxCycles: a.detector_adversarial.max_cycles,
          feedFeedbackToClassification: a.detector_adversarial.feed_feedback_to_classification,
          maxThoughtIterations: a.detector_adversarial.max_thought_iterations,
        }
      : defaults.detectorAdversarial,
    classification: {
      ...toolsFromApi(a.classification, defaults.classification),
      prompt: a.classification.prompt,
      promptVars: a.classification.prompt_vars,
      maxThoughtIterations: a.classification.max_thought_iterations ?? 5,
      outputLabels: a.classification.output_labels ?? defaults.classification.outputLabels,
    },
    adversarial: {
      ...toolsFromApi(a.adversarial, defaults.adversarial),
      prompt: a.adversarial.prompt,
      promptVars: a.adversarial.prompt_vars,
      maxCycles: a.adversarial.max_cycles,
      feedFeedbackToClassification: a.adversarial.feed_feedback_to_classification,
    },
    analyst: {
      prompt: a.analyst?.prompt ?? defaults.analyst.prompt,
      promptVars: a.analyst?.prompt_vars ?? defaults.analyst.promptVars,
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
    parentRef?: { configuration_id: string; version: number } | null;
    createdBy?: string | null;
  },
): CreateConfigurationRequest {
  const segments: Record<string, ApiSegmentSettings> = {};
  for (const [code, segment] of Object.entries(settings.segments)) {
    segments[code] = segmentToApi({
      ...segment,
      agent: segment.agent,
    });
  }
  return {
    name: opts.name,
    configuration_id: opts.configurationId,
    based_on_version: opts.basedOnVersion ?? null,
    parent_ref: opts.parentRef ?? null,
    description: opts.description,
    general: {
      migration_window_enabled: settings.migrationWindowEnabled,
      migration_window_datetime: settings.migrationWindowDatetime,
    },
    infra: {
      max_instances: settings.maxInstances,
      auto_scale: settings.autoScale,
      fraud_history_db_retention_days: settings.fraudHistoryDbRetentionDays,
      fraud_history_cold_storage_retention_months: settings.fraudHistoryColdStorageRetentionMonths,
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
    migrationWindowEnabled: detail.general.migration_window_enabled,
    migrationWindowDatetime: detail.general.migration_window_datetime,
    maxInstances: detail.infra.max_instances,
    autoScale: detail.infra.auto_scale,
    fraudHistoryDbRetentionDays: detail.infra.fraud_history_db_retention_days,
    fraudHistoryColdStorageRetentionMonths:
      detail.infra.fraud_history_cold_storage_retention_months,
    maxTestInstances: detail.test.max_test_instances,
    maxConcurrentExperiments: detail.test.max_concurrent_experiments,
    experimentTimeoutMinutes: detail.test.experiment_timeout_minutes,
    maxStoredTestRuns: detail.test.max_stored_test_runs,
    testCleanupPolicy: detail.test.test_cleanup_policy,
    segments,
  };
}
