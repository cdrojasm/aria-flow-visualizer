import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { Field, SwitchField } from "@/components/configuracion/shared/FormControls";
import { useRole } from "@/hooks/useRole";
import {
  getAssistantOptimizerSettings,
  listAssistantOptimizerSettingsChanges,
  updateAssistantOptimizerSettings,
  getMatureSamplerFields,
  getMatureSamplerSchemaConfiguration,
  previewMatureSample,
  startMatureSample,
  updateMatureSamplerSchemaConfiguration,
  type AssistantOptimizerSettings,
  type MatureSamplerSchemaConfiguration,
} from "@/lib/api/assistantOptimizerSettings.functions";

type NumberField = {
  key: keyof AssistantOptimizerSettings;
  label: string;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
};
type ToggleField = {
  key: keyof AssistantOptimizerSettings;
  label: string;
  hint: string;
};
type SectionDefinition = {
  id: string;
  title: string;
  description: string;
  toggles?: ToggleField[];
  numbers?: NumberField[];
  lists?: {
    key: "sampler_compatible_schema_versions";
    label: string;
    hint: string;
  }[];
  policy?: boolean;
};

const SECTIONS: SectionDefinition[] = [
  {
    id: "assistant",
    title: "Asistente",
    description: "Límites de uso y retención del chat. Los cambios se aplican de inmediato.",
    toggles: [
      {
        key: "assistant_enabled",
        label: "Asistente habilitado",
        hint: "Permite usar el asistente en las herramientas autorizadas.",
      },
    ],
    numbers: [
      {
        key: "assistant_max_message_chars",
        label: "Máximo de caracteres por mensaje",
        min: 1,
        max: 8_000,
      },
      {
        key: "assistant_max_messages_per_session",
        label: "Mensajes máximos por sesión",
        min: 1,
        max: 1_000,
      },
      { key: "max_sessions_per_user", label: "Sesiones simultáneas por usuario", min: 1, max: 100 },
      {
        key: "chat_retention_days",
        label: "Retención de conversaciones",
        min: 1,
        max: 730,
        suffix: "días",
      },
    ],
  },
  {
    id: "optimizer",
    title: "Optimizador",
    description: "Interruptor de seguridad, concurrencia, presupuesto y criterio de parada.",
    toggles: [
      {
        key: "optimizer_enabled",
        label: "Optimizador habilitado",
        hint: "Al apagarlo se detienen nuevas sesiones de optimización.",
      },
      {
        key: "optimizer_budget_renewal_requires_approval",
        label: "Aprobación para renovar presupuesto",
        hint: "Toda renovación requiere aprobación explícita.",
      },
      {
        key: "optimizer_stop_on_critical_failure",
        label: "Detener ante fallo crítico",
        hint: "Detiene la sesión ante un fallo no reintentable o cuando se agotan los reintentos.",
      },
    ],
    numbers: [
      {
        key: "optimizer_max_concurrent_sessions",
        label: "Sesiones concurrentes máximas",
        min: 1,
        max: 100,
      },
      {
        key: "optimizer_max_concurrent_runs",
        label: "Ejecuciones concurrentes máximas",
        min: 1,
        max: 100,
      },
      {
        key: "optimizer_max_parallel_experiments",
        label: "Experimentos en paralelo por sesión",
        min: 1,
        max: 10,
      },
      {
        key: "optimizer_max_candidates_per_session",
        label: "Candidatos por sesión",
        min: 1,
        max: 100,
      },
      {
        key: "optimizer_session_budget_ceiling_tokens",
        label: "Tope de presupuesto por tokens",
        min: 1,
        max: 10_000_000,
        suffix: "tokens",
      },
      {
        key: "optimizer_session_budget_ceiling_usd",
        label: "Tope de presupuesto monetario",
        min: 0.01,
        max: 1_000_000,
        step: 0.01,
        suffix: "USD",
      },
      {
        key: "optimizer_session_budget_ceiling_seconds",
        label: "Duración máxima de sesión",
        min: 1,
        max: 604_800,
        suffix: "segundos",
      },
      { key: "optimizer_max_budget_renewals", label: "Renovaciones máximas", min: 0, max: 100 },
      {
        key: "optimizer_iterations_without_improvement",
        label: "Iteraciones sin mejora antes de parar",
        min: 1,
        max: 100,
      },
      {
        key: "optimizer_max_retryable_failures",
        label: "Reintentos ante fallos reintentables",
        min: 0,
        max: 10,
      },
    ],
  },
  {
    id: "objective",
    title: "Objetivo y límites",
    description: "Valores por defecto y topes que se copian en cada sesión nueva.",
    numbers: [
      { key: "objective_precision_floor", label: "Piso de precisión", min: 0, max: 1, step: 0.01 },
      {
        key: "objective_minimum_support_per_segment",
        label: "Soporte mínimo por segmento",
        min: 1,
        max: 10_000_000,
      },
      {
        key: "objective_minimum_count_to_publish_aggregates",
        label: "Casos mínimos para publicar agregados",
        min: 1,
        max: 1_000_000,
      },
      {
        key: "objective_minimum_mature_alert_coverage_pct",
        label: "Cobertura mínima de alertas maduras",
        min: 0,
        max: 100,
        step: 0.1,
        suffix: "%",
      },
    ],
  },
  {
    id: "sampler",
    title: "Muestreo de datos",
    description: "Configuración de disparadores, precisión estadística y particiones del dataset.",
    toggles: [
      {
        key: "sampler_enabled",
        label: "Muestreador habilitado",
        hint: "Permite generar muestras cuando se active un disparador.",
      },
      {
        key: "sampler_period_trigger_enabled",
        label: "Disparador por periodo",
        hint: "Ejecuta el muestreo por calendario.",
      },
      {
        key: "sampler_volume_trigger_enabled",
        label: "Disparador por volumen",
        hint: "Ejecuta el muestreo al alcanzar el volumen configurado.",
      },
      {
        key: "sampler_statistical_trigger_enabled",
        label: "Disparador estadístico",
        hint: "Ejecuta el muestreo cuando se supera el umbral estadístico.",
      },
    ],
    numbers: [
      {
        key: "sampler_period_trigger_interval_days",
        label: "Intervalo del disparador periódico",
        min: 1,
        max: 365,
        suffix: "días",
      },
      {
        key: "sampler_statistical_trigger_threshold",
        label: "Umbral estadístico",
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: "sampler_cooldown_days",
        label: "Enfriamiento entre muestras",
        min: 0,
        max: 365,
        suffix: "días",
      },
      {
        key: "sampler_period_days",
        label: "Periodo de datos muestreado",
        min: 1,
        max: 365,
        suffix: "días",
      },
      {
        key: "sampler_volume_threshold",
        label: "Volumen para disparar muestreo",
        min: 1,
        max: 100_000_000,
      },
      {
        key: "sampler_error_margin_pct",
        label: "Margen de error",
        min: 0.1,
        max: 50,
        step: 0.1,
        suffix: "%",
      },
      {
        key: "sampler_confidence_pct",
        label: "Nivel de confianza",
        min: 50,
        max: 99.9,
        step: 0.1,
        suffix: "%",
      },
      { key: "sampler_minimum_per_stratum", label: "Mínimo por estrato", min: 1, max: 1_000_000 },
      {
        key: "sampler_fraud_oversampling_ratio",
        label: "Razón de sobremuestreo de fraude",
        min: 1,
        max: 100,
        step: 0.1,
      },
      {
        key: "sampler_train_proportion",
        label: "Proporción para train",
        min: 0.01,
        max: 0.98,
        step: 0.01,
      },
      {
        key: "sampler_validation_proportion",
        label: "Proporción para validation",
        min: 0.01,
        max: 0.98,
        step: 0.01,
      },
      {
        key: "sampler_test_proportion",
        label: "Proporción para test",
        min: 0.01,
        max: 0.98,
        step: 0.01,
      },
      {
        key: "sampler_max_retained_samples",
        label: "Máximo de muestras retenidas",
        min: 1,
        max: 120,
      },
    ],
    lists: [
      {
        key: "sampler_compatible_schema_versions",
        label: "Versiones de esquema compatibles",
        hint: "Escribe una versión por línea.",
      },
    ],
    policy: true,
  },
];

const DEFAULT_SETTINGS: AssistantOptimizerSettings = {
  assistant_enabled: true,
  assistant_max_message_chars: 8_000,
  assistant_max_messages_per_session: 100,
  max_sessions_per_user: 5,
  chat_retention_days: 730,
  optimizer_enabled: false,
  optimizer_max_concurrent_sessions: 2,
  optimizer_max_concurrent_runs: 6,
  optimizer_max_parallel_experiments: 3,
  optimizer_max_candidates_per_session: 10,
  optimizer_session_budget_ceiling_tokens: 100_000,
  optimizer_session_budget_ceiling_usd: 50,
  optimizer_session_budget_ceiling_seconds: 43_200,
  optimizer_budget_renewal_requires_approval: true,
  optimizer_max_budget_renewals: 0,
  optimizer_iterations_without_improvement: 3,
  optimizer_stop_on_critical_failure: true,
  optimizer_max_retryable_failures: 2,
  objective_precision_floor: 0.9,
  objective_minimum_support_per_segment: 100,
  objective_minimum_count_to_publish_aggregates: 20,
  objective_minimum_mature_alert_coverage_pct: 80,
  sampler_enabled: false,
  sampler_period_trigger_enabled: true,
  sampler_period_trigger_interval_days: 7,
  sampler_volume_trigger_enabled: false,
  sampler_statistical_trigger_enabled: false,
  sampler_statistical_trigger_threshold: 0,
  sampler_cooldown_days: 7,
  sampler_period_days: 30,
  sampler_volume_threshold: 10_000,
  sampler_error_margin_pct: 5,
  sampler_confidence_pct: 95,
  sampler_strata: [],
  sampler_minimum_per_stratum: 100,
  sampler_fraud_oversampling_ratio: 1,
  sampler_train_proportion: 0.6,
  sampler_validation_proportion: 0.2,
  sampler_test_proportion: 0.2,
  sampler_seed_policy: "fixed_per_sample",
  sampler_max_retained_samples: 12,
  sampler_compatible_schema_versions: [],
};

function keysFor(section: SectionDefinition): (keyof AssistantOptimizerSettings)[] {
  return [
    ...(section.toggles?.map(({ key }) => key) ?? []),
    ...(section.numbers?.map(({ key }) => key) ?? []),
    ...(section.lists?.map(({ key }) => key) ?? []),
    ...(section.policy ? ["sampler_seed_policy" as const] : []),
    ...(section.id === "sampler" ? ["sampler_strata" as const] : []),
  ];
}

export function AgentSettingsPanel({ readOnly = false }: { readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const { role } = useRole();
  const canEdit = !readOnly && (role === "manager" || role === "release_manager");
  const settingsQuery = useQuery({
    queryKey: ["assistantOptimizerSettings"],
    queryFn: getAssistantOptimizerSettings,
  });
  const changesQuery = useQuery({
    queryKey: ["assistantOptimizerSettingsChanges"],
    queryFn: () => listAssistantOptimizerSettingsChanges(10),
  });
  const samplerFieldsQuery = useQuery({
    queryKey: ["matureSamplerFields"],
    queryFn: getMatureSamplerFields,
    enabled: canEdit,
  });
  const samplerSchemaQuery = useQuery({
    queryKey: ["matureSamplerSchemaConfiguration"],
    queryFn: getMatureSamplerSchemaConfiguration,
    enabled: canEdit,
  });
  const previewMutation = useMutation({ mutationFn: previewMatureSample });
  const runSamplerMutation = useMutation({ mutationFn: startMatureSample });
  const saveSchemaMappingMutation = useMutation({
    mutationFn: updateMatureSamplerSchemaConfiguration,
    onSuccess: async (configuration) => {
      setSchemaMappingDraft(configuration.mapping);
      setLabelMappingText(JSON.stringify(configuration.mapping.label_value_mapping, null, 2));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["matureSamplerSchemaConfiguration"] }),
        queryClient.invalidateQueries({ queryKey: ["assistantOptimizerSettingsChanges"] }),
      ]);
    },
  });
  const [draft, setDraft] = useState<AssistantOptimizerSettings | null>(null);
  const [schemaMappingDraft, setSchemaMappingDraft] = useState<
    MatureSamplerSchemaConfiguration["mapping"] | null
  >(null);
  const [labelMappingText, setLabelMappingText] = useState("");
  useEffect(() => {
    if (settingsQuery.data && draft === null) setDraft(structuredClone(settingsQuery.data));
  }, [settingsQuery.data, draft]);
  useEffect(() => {
    const mapping = samplerSchemaQuery.data?.mapping;
    if (mapping && schemaMappingDraft === null) {
      setSchemaMappingDraft(mapping);
      setLabelMappingText(JSON.stringify(mapping.label_value_mapping, null, 2));
    }
  }, [samplerSchemaQuery.data, schemaMappingDraft]);

  const saveMutation = useMutation({
    mutationFn: updateAssistantOptimizerSettings,
    onSuccess: async (saved) => {
      setDraft(saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["assistantOptimizerSettings"] }),
        queryClient.invalidateQueries({ queryKey: ["assistantOptimizerSettingsChanges"] }),
      ]);
    },
  });

  const updateDraft = (
    key: keyof AssistantOptimizerSettings,
    value: boolean | number | string | string[],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };
  const saveSection = (section: SectionDefinition) => {
    if (!draft || !settingsQuery.data) return;
    const next = structuredClone(settingsQuery.data);
    keysFor(section).forEach((key) => {
      next[key] = draft[key] as never;
    });
    const disabledSwitches = ["assistant_enabled", "optimizer_enabled", "sampler_enabled"] as const;
    if (disabledSwitches.some((key) => settingsQuery.data[key] && !next[key])) {
      if (
        !window.confirm(
          "Vas a apagar un interruptor de seguridad. El cambio tendrá efecto inmediato y afectará las próximas sesiones. ¿Deseas continuar?",
        )
      )
        return;
    }
    const capKeys = [
      "optimizer_max_concurrent_sessions",
      "optimizer_max_concurrent_runs",
      "optimizer_max_parallel_experiments",
      "optimizer_max_candidates_per_session",
      "optimizer_session_budget_ceiling_tokens",
      "optimizer_session_budget_ceiling_usd",
      "optimizer_session_budget_ceiling_seconds",
    ] as const;
    if (capKeys.some((key) => Number(next[key]) > Number(settingsQuery.data[key]))) {
      if (
        !window.confirm(
          "Vas a subir un tope de capacidad o presupuesto. Esto puede aumentar el consumo de recursos. ¿Deseas continuar?",
        )
      )
        return;
    }
    saveMutation.mutate(next);
  };

  if (settingsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-text-secondary">
        No se pudo leer la configuración del asistente y el optimizador.
        <button
          type="button"
          className="ml-2 font-medium text-primary"
          onClick={() => settingsQuery.refetch()}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {settingsQuery.isError && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-text-secondary">
          No se pudo leer la configuración. Se muestran los últimos valores disponibles y se puede
          volver a intentar.
          <button
            type="button"
            className="ml-2 font-medium text-primary"
            onClick={() => settingsQuery.refetch()}
          >
            Reintentar
          </button>
        </div>
      )}
      {SECTIONS.map((section) => (
        <section
          key={section.id}
          className="rounded-xl border border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-text-primary">
                {section.title}{" "}
                <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                  efecto inmediato
                </span>
              </h2>
              <p className="mt-1 text-[12px] text-text-secondary">{section.description}</p>
            </div>
            <button
              type="button"
              disabled={!canEdit || saveMutation.isPending}
              onClick={() => saveSection(section)}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}{" "}
              Guardar sección
            </button>
          </div>
          <div className="grid gap-5 p-6 md:grid-cols-2">
            {section.toggles?.map(({ key, label, hint }) => (
              <SwitchField
                key={key}
                label={label}
                hint={hint}
                checked={Boolean(draft[key])}
                disabled={!canEdit}
                onCheckedChange={(value) => updateDraft(key, value)}
              />
            ))}
            {section.numbers?.map(({ key, label, min, max, step = 1, suffix }) => (
              <Field key={key} label={label}>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={Number(draft[key])}
                    disabled={!canEdit}
                    onChange={(event) => updateDraft(key, event.target.valueAsNumber)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary disabled:opacity-60"
                  />
                  {suffix && <span className="text-xs text-text-secondary">{suffix}</span>}
                </div>
              </Field>
            ))}
            {section.lists?.map(({ key, label, hint }) => (
              <Field key={key} label={label} hint={hint}>
                <textarea
                  rows={3}
                  value={(draft[key] as string[]).join("\n")}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateDraft(
                      key,
                      event.target.value
                        .split("\n")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary disabled:opacity-60"
                />
              </Field>
            ))}
            {section.id === "sampler" && (
              <Field
                label="Campos de muestreo"
                hint="Selecciona campos disponibles en las versiones compatibles del esquema de alertas. Los sensibles y las etiquetas no aparecen."
              >
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                  {samplerFieldsQuery.data?.map((field) => (
                    <label
                      key={field}
                      className="flex items-center gap-2 text-sm text-text-primary"
                    >
                      <input
                        type="checkbox"
                        checked={draft.sampler_strata.includes(field)}
                        disabled={!canEdit}
                        onChange={(event) =>
                          updateDraft(
                            "sampler_strata",
                            event.target.checked
                              ? [...draft.sampler_strata, field]
                              : draft.sampler_strata.filter((selected) => selected !== field),
                          )
                        }
                      />
                      {field}
                    </label>
                  ))}
                  {samplerFieldsQuery.isError && (
                    <p role="alert" className="text-xs text-danger">
                      No se pudo cargar el pool del esquema.
                    </p>
                  )}
                  {samplerFieldsQuery.data?.length === 0 && (
                    <p className="text-xs text-text-secondary">
                      No hay campos seleccionables en el esquema compatible.
                    </p>
                  )}
                </div>
              </Field>
            )}
            {section.id === "sampler" && (
              <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
                <Field label="Campo de marca inicial (esquema)">
                  <select
                    aria-label="Campo de marca inicial (esquema)"
                    value={schemaMappingDraft?.initial_mark_field ?? ""}
                    disabled={!canEdit || !schemaMappingDraft}
                    onChange={(event) =>
                      setSchemaMappingDraft((current) =>
                        current ? { ...current, initial_mark_field: event.target.value } : current,
                      )
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary disabled:opacity-60"
                  >
                    <option value="">Selecciona la marca inicial</option>
                    {samplerSchemaQuery.data?.initial_mark_fields.map(({ field, type }) => (
                      <option key={field} value={field}>
                        {field} ({type})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Fecha de marca inicial (esquema)">
                  <select
                    aria-label="Fecha de marca inicial (esquema)"
                    value={schemaMappingDraft?.initial_marking_date_field ?? ""}
                    disabled={!canEdit || !schemaMappingDraft}
                    onChange={(event) =>
                      setSchemaMappingDraft((current) =>
                        current
                          ? { ...current, initial_marking_date_field: event.target.value }
                          : current,
                      )
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary disabled:opacity-60"
                  >
                    <option value="">Selecciona una fecha inicial</option>
                    {samplerSchemaQuery.data?.initial_marking_date_fields.map(({ field, type }) => (
                      <option key={field} value={field}>
                        {field} ({type})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Etiqueta vigente (esquema)">
                  <select
                    aria-label="Etiqueta vigente (esquema)"
                    value={schemaMappingDraft?.target_field ?? ""}
                    disabled={!canEdit || !schemaMappingDraft}
                    onChange={(event) =>
                      setSchemaMappingDraft((current) =>
                        current ? { ...current, target_field: event.target.value } : current,
                      )
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary disabled:opacity-60"
                  >
                    <option value="">Selecciona una etiqueta</option>
                    {samplerSchemaQuery.data?.target_fields.map(({ field }) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Fecha de última marcación (esquema)">
                  <select
                    aria-label="Fecha de última marcación (esquema)"
                    value={schemaMappingDraft?.marking_date_field ?? ""}
                    disabled={!canEdit || !schemaMappingDraft}
                    onChange={(event) =>
                      setSchemaMappingDraft((current) =>
                        current ? { ...current, marking_date_field: event.target.value } : current,
                      )
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary disabled:opacity-60"
                  >
                    <option value="">Selecciona una fecha</option>
                    {samplerSchemaQuery.data?.marking_date_fields.map(({ field, type }) => (
                      <option key={field} value={field}>
                        {field} ({type})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Equivalencias de etiqueta (JSON)"
                  hint='Asigna cada valor recibido a "fraud" o "no_fraud". Ejemplo: {"Fraude":"fraud","No fraude":"no_fraud"}.'
                >
                  <textarea
                    aria-label="Equivalencias de etiqueta (JSON)"
                    rows={4}
                    value={labelMappingText}
                    disabled={!canEdit || !schemaMappingDraft}
                    onChange={(event) => setLabelMappingText(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-text-primary disabled:opacity-60"
                  />
                </Field>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={
                      !canEdit || saveSchemaMappingMutation.isPending || !schemaMappingDraft
                    }
                    onClick={() => {
                      if (!schemaMappingDraft) return;
                      try {
                        const label_value_mapping = JSON.parse(labelMappingText) as Record<
                          string,
                          "fraud" | "no_fraud"
                        >;
                        saveSchemaMappingMutation.mutate({
                          ...schemaMappingDraft,
                          label_value_mapping,
                        });
                      } catch {
                        window.alert("Las equivalencias deben ser un objeto JSON válido.");
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {saveSchemaMappingMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Guardar marcas, fechas y equivalencias
                  </button>
                </div>
                {samplerSchemaQuery.isError && (
                  <p role="alert" className="text-xs text-danger md:col-span-2">
                    No se pudo cargar el pool de etiquetas y fechas del esquema.
                  </p>
                )}
                {saveSchemaMappingMutation.isError && (
                  <p role="alert" className="text-xs text-danger md:col-span-2">
                    {saveSchemaMappingMutation.error.message}
                  </p>
                )}
                {saveSchemaMappingMutation.isSuccess && (
                  <p role="status" className="text-xs text-success md:col-span-2">
                    Etiqueta, fecha y equivalencias guardadas y auditadas.
                  </p>
                )}
              </div>
            )}
            {section.id === "sampler" && (
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <button
                  type="button"
                  disabled={previewMutation.isPending || !canEdit}
                  onClick={() => previewMutation.mutate()}
                  className="rounded-md border border-border px-3 py-2 text-xs font-medium text-text-primary disabled:opacity-50"
                >
                  Vista previa del muestreo
                </button>
                <button
                  type="button"
                  disabled={runSamplerMutation.isPending || !canEdit || !draft.sampler_enabled}
                  onClick={() => runSamplerMutation.mutate()}
                  className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  Crear muestra madura
                </button>
                {previewMutation.data && (
                  <div
                    role="status"
                    className="w-full rounded-md bg-muted p-3 text-xs text-text-secondary"
                  >
                    <p>Alertas elegibles: {previewMutation.data.eligible_alerts}</p>
                    <p>Tamaño estimado: {previewMutation.data.estimated_sample_size}</p>
                    <p>
                      Disparadores: {previewMutation.data.active_triggers.join(", ") || "ninguno"}
                    </p>
                    <p>
                      Conteos por estrato:{" "}
                      {Object.entries(previewMutation.data.counts_by_stratum)
                        .map(([key, count]) => `${key}: ${count}`)
                        .join(" · ") || "sin alertas maduras"}
                    </p>
                  </div>
                )}
                {runSamplerMutation.data && (
                  <p role="status" className="text-xs text-text-secondary">
                    Ejecución de muestreo {runSamplerMutation.data.id}:{" "}
                    {runSamplerMutation.data.status}
                  </p>
                )}
                {(previewMutation.isError || runSamplerMutation.isError) && (
                  <p role="alert" className="w-full text-xs text-danger">
                    No se pudo ejecutar el muestreo. Revisa los campos y la configuración del
                    servidor.
                  </p>
                )}
              </div>
            )}
            {section.policy && (
              <Field
                label="Política de semilla"
                hint="Fija una semilla por muestra o genera una nueva en cada muestra."
              >
                <select
                  value={String(draft.sampler_seed_policy)}
                  disabled={!canEdit}
                  onChange={(event) => updateDraft("sampler_seed_policy", event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary disabled:opacity-60"
                >
                  <option value="fixed_per_sample">Fija por muestra</option>
                  <option value="random_per_sample">Aleatoria por muestra</option>
                </select>
              </Field>
            )}
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
          <History className="h-4 w-4" /> Historial de cambios
        </div>
        {changesQuery.data?.length ? (
          <ul className="space-y-3">
            {changesQuery.data.map((change) => (
              <li
                key={change.id}
                className="border-t border-border pt-3 text-xs text-text-secondary"
              >
                <p className="font-medium text-text-primary">
                  {change.changed_by} · {new Date(change.changed_at).toLocaleString("es-CO")}
                </p>
                <p className="mt-1">{change.changes.map((item) => item.path).join(", ")}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-secondary">Aún no hay cambios registrados.</p>
        )}
        <button
          type="button"
          disabled={!canEdit || saveMutation.isPending}
          onClick={() => {
            if (
              window.confirm(
                "Se restaurarán los valores por defecto y los cambios tendrán efecto inmediato. ¿Deseas continuar?",
              )
            ) {
              setDraft(structuredClone(DEFAULT_SETTINGS));
              saveMutation.mutate(structuredClone(DEFAULT_SETTINGS));
            }
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-text-primary disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restaurar valores por defecto
        </button>
        {!canEdit && (
          <p className="mt-3 text-xs text-text-secondary">
            Vista de solo lectura. Solo manager y release manager pueden editar estos valores.
          </p>
        )}
        {saveMutation.isError && (
          <p role="alert" className="mt-3 text-xs text-danger">
            {saveMutation.error.message}
          </p>
        )}
        {saveMutation.isSuccess && (
          <p role="status" className="mt-3 text-xs text-success">
            Cambios guardados y auditados.
          </p>
        )}
      </section>
    </div>
  );
}
