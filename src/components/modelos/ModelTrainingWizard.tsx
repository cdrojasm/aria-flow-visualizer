import {
  FeatureRecipeWorkspace,
  HistoryMappingControls,
  type FeatureDiagnostic,
} from "./FeatureRecipeWorkspace";
import {
  emptyConfiguration,
  parseConfiguration,
  type FeatureConfiguration,
} from "@/lib/api/feature-recipes.functions";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SideDrawer } from "@/components/ui/side-drawer";
import { SectionTabs } from "@/components/ui/section-tabs";
import { Field } from "@/components/configuracion/shared/FormControls";
import {
  createModel,
  trainModel,
  type FieldTransform,
  type FieldTransformKind,
  type HistoricalFeature,
  type TrainingConfig,
} from "@/lib/api/models.functions";
import { getAlertFieldMapping, getDatasets, getDatasetSummary } from "@/lib/api/datasets.functions";
import { getActiveAlertSchema } from "@/lib/api/alertSchema.functions";
import { TrainingContractSummary } from "./wizard/TrainingContractSummary";
import {
  assessTarget,
  buildTrainingContract,
  draftSchemaVersion,
  DRAFT_KEY,
  leakBlocker,
  suggestedTargets,
} from "./wizard/trainingContract";

const input =
  "w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary";
const textareaClass =
  "w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary";
const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40";
const button = `${buttonBase} border border-border hover:bg-surface`;
const primary = `${buttonBase} bg-primary text-white hover:bg-primary/90`;
const panel = "rounded-xl border border-border bg-card p-5 space-y-4";
const initialConfig: TrainingConfig = {
  n_estimators: 400,
  max_depth: 4,
  learning_rate: 0.03,
  subsample: 0.8,
  colsample_bytree: 0.8,
  reg_lambda: 1,
  min_child_weight: 3,
  scale_pos_weight: null,
  early_stopping_rounds: 30,
  split_strategy: "temporal",
  time_field: "fecha_transaccion",
  timezone: "America/Bogota",
};
const parameters: [keyof TrainingConfig, string, number, number, number][] = [
  ["n_estimators", "Número máximo de árboles", 1, 5000, 1],
  ["max_depth", "Profundidad máxima", 1, 16, 1],
  ["learning_rate", "Tasa de aprendizaje", 0.001, 1, 0.001],
  ["subsample", "Proporción de filas", 0.1, 1, 0.1],
  ["colsample_bytree", "Proporción de columnas", 0.1, 1, 0.1],
  ["reg_lambda", "Regularización L2", 0, 100, 0.1],
  ["min_child_weight", "Peso mínimo del nodo", 0, 100, 0.1],
];
const kinds: [FieldTransformKind, string][] = [
  ["numeric", "Numérico"],
  ["categorical", "Categórico"],
  ["date_derived", "Fecha: hora, día y mes"],
  ["rule_multihot", "Lista de reglas"],
  ["drop", "Excluir"],
];
const operations: [HistoricalFeature["operation"], string][] = [
  ["count", "Contar eventos"],
  ["sum", "Sumar importes"],
  ["median", "Mediana"],
  ["mean", "Promedio"],
  ["max", "Máximo"],
  ["distinct", "Valores distintos"],
  ["recency", "Horas desde el evento más reciente"],
];
export function ModelTrainingWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [recipeConfiguration, setRecipeConfiguration] =
    useState<FeatureConfiguration>(emptyConfiguration);
  const [recipesValid, setRecipesValid] = useState(true);
  const [featureDiagnostic, setFeatureDiagnostic] = useState<FeatureDiagnostic | null>(null);
  const [reviewRecipeId, setReviewRecipeId] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftCorrupt, setDraftCorrupt] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [step, setStep] = useState("0");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [dataset, setDataset] = useState("");
  const [target, setTarget] = useState("");
  const [positive, setPositive] = useState<string[]>([]);
  const [features, setFeatures] = useState<FieldTransform[]>([]);
  const [history, setHistory] = useState<HistoricalFeature[]>([]);
  const [config, setConfig] = useState<TrainingConfig>({ ...initialConfig });
  const [confirmed, setConfirmed] = useState(false);
  const [currencyConfirmed, setCurrencyConfirmed] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [schemaVersion, setSchemaVersion] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.version !== 1) throw new Error("Versión de borrador incompatible");
        const strings = ["tag", "description", "dataset", "target"];
        if (
          !strings.every((k) => typeof d[k] === "string") ||
          !["0", "1", "2", "3"].includes(d.step) ||
          !Array.isArray(d.positive) ||
          d.positive.some((v: unknown) => typeof v !== "string") ||
          !Array.isArray(d.features) ||
          !Array.isArray(d.history) ||
          !d.config ||
          typeof d.config !== "object"
        )
          throw new Error("Borrador inválido");
        if (
          d.features.some(
            (f: FieldTransform) =>
              !f ||
              typeof f.field !== "string" ||
              !kinds.some(([k]) => k === f.kind) ||
              !(f.reference_field === null || typeof f.reference_field === "string") ||
              !Number.isFinite(f.top_n),
          )
        )
          throw new Error("Campos inválidos");
        if (
          d.history.some(
            (r: HistoricalFeature) =>
              !r ||
              !["name", "field", "reference_field", "time_field", "value_field"].every(
                (k) => typeof (r as unknown as Record<string, unknown>)[k] === "string",
              ) ||
              !operations.some(([k]) => k === r.operation) ||
              !Number.isFinite(r.window_hours) ||
              ![r.filter_field, r.filter_value, r.compare_field].every(
                (v) => v == null || typeof v === "string",
              ),
          )
        )
          throw new Error("Historial inválido");
        if (
          !parameters.every(
            ([k]) => typeof d.config[k] === "number" && Number.isFinite(d.config[k]),
          ) ||
          !["temporal", "stratified"].includes(d.config.split_strategy) ||
          typeof d.config.time_field !== "string" ||
          typeof d.config.timezone !== "string" ||
          ![d.config.scale_pos_weight, d.config.early_stopping_rounds].every(
            (v) => v === null || (typeof v === "number" && Number.isFinite(v)),
          )
        )
          throw new Error("Parámetros inválidos");
        const recipes = parseConfiguration(JSON.stringify(d.recipeConfiguration));
        setRecipeConfiguration(recipes);
        setRecipesValid(!recipes.recipes.some((r) => r.enabled));
        setStep(d.step ?? "0");
        setTag(d.tag ?? "");
        setDescription(d.description ?? "");
        setDataset(d.dataset ?? "");
        setTarget(d.target ?? "");
        setPositive(d.positive ?? []);
        setFeatures(d.features ?? []);
        setHistory(d.history ?? []);
        setConfig(d.config ?? initialConfig);
        setSchemaVersion(draftSchemaVersion(d));
        setConfirmed(false);
        setCurrencyConfirmed(false);
      }
    } catch {
      setDraftCorrupt(true);
      setDraftMessage(
        "No se pudo recuperar el borrador local. Puedes continuar y guardar uno nuevo.",
      );
    }
    setDraftLoaded(true);
  }, []);
  useEffect(() => {
    if (!draftLoaded || savedId || draftCorrupt) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          version: 1,
          step,
          tag,
          description,
          dataset,
          target,
          positive,
          features,
          history,
          config,
          recipeConfiguration,
          schemaVersion,
        }),
      );
    } catch {
      setDraftMessage("No se pudo guardar localmente. Exporta las variables para conservarlas.");
    }
  }, [
    draftLoaded,
    draftCorrupt,
    savedId,
    step,
    tag,
    description,
    dataset,
    target,
    positive,
    features,
    history,
    config,
    recipeConfiguration,
    schemaVersion,
  ]);
  useEffect(() => {
    setRecipesValid(!recipeConfiguration.recipes.some((r) => r.enabled));
  }, [dataset, target]);
  const datasets = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
  const summary = useQuery({
    queryKey: ["datasetSummary", dataset],
    queryFn: () => getDatasetSummary({ data: { name: dataset } }),
    enabled: !!dataset,
  });
  const activeSchema = useQuery({
    queryKey: ["alertSchema", "active"],
    queryFn: () => getActiveAlertSchema(),
  });
  const schema = activeSchema.data ?? null;
  const alertFieldMapping = useQuery({
    queryKey: ["alertFieldMapping", dataset],
    queryFn: () => getAlertFieldMapping({ data: { name: dataset } }),
    enabled: !!dataset,
  });
  const fieldAliases: Record<string, string[]> = Object.create(null);
  for (const [alertField, datasetField] of Object.entries(alertFieldMapping.data?.mappings ?? {})) {
    (fieldAliases[datasetField] ??= []).push(alertField);
  }
  useEffect(() => {
    // A draft without a pinned schema version (new or created before this
    // field existed) adopts the active one the first time it is known.
    if (draftLoaded && schemaVersion === null && schema) setSchemaVersion(schema.version);
  }, [draftLoaded, schemaVersion, schema]);
  const available = (
    summary.data?.available_fields ?? Object.keys(summary.data?.field_distributions ?? {})
  ).filter((f) => f !== target);
  const suggested = suggestedTargets(summary.data?.available_fields ?? [], schema, fieldAliases);
  const targetAssessment = assessTarget(target, schema, fieldAliases);
  const contract = buildTrainingContract(recipeConfiguration.recipes, schema, fieldAliases);
  const distribution = summary.data?.field_distributions[target] ?? [];
  const monetary = history.some((r) => ["sum", "median", "mean", "max"].includes(r.operation));
  const validData =
    !!tag.trim() &&
    !!dataset &&
    !!target &&
    positive.length > 0 &&
    distribution.length >= 2 &&
    !summary.isFetching &&
    !summary.isError;
  const missingData = [
    !tag.trim() && "nombre del modelo",
    !dataset && "dataset",
    dataset && !target && "campo objetivo",
    target && positive.length === 0 && "clase positiva",
    target && distribution.length === 1 && "un objetivo con al menos dos clases",
    dataset && summary.isFetching && "esperar a que carguen los campos",
    dataset && summary.isError && "cargar el resumen del dataset",
  ].filter(Boolean) as string[];
  const validHistory = history.every(
    (r) =>
      /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(r.name) &&
      available.includes(r.field) &&
      available.includes(r.reference_field) &&
      !!r.time_field.trim() &&
      !!r.value_field.trim() &&
      (!r.filter_field || !!r.filter_value?.trim()) &&
      (!r.compare_field || available.includes(r.compare_field)),
  );
  const validFeatures =
    (features.some((f) => f.kind !== "drop") ||
      history.length > 0 ||
      recipeConfiguration.recipes.some((r) => r.enabled)) &&
    recipesValid &&
    validHistory &&
    new Set(history.map((r) => r.name)).size === history.length &&
    (!monetary || currencyConfirmed);
  const validConfig =
    confirmed &&
    (config.split_strategy !== "temporal" || available.includes(config.time_field)) &&
    parameters.every(
      ([k, , min, max, increment]) =>
        typeof config[k] === "number" &&
        Number.isFinite(config[k]) &&
        Number(config[k]) >= min &&
        Number(config[k]) <= max &&
        (increment !== 1 || Number.isInteger(config[k])),
    ) &&
    (config.scale_pos_weight === null ||
      (config.scale_pos_weight > 0 && config.scale_pos_weight <= 100000));
  const valid = validData && validFeatures && validConfig && contract.leaks.length === 0;
  const blockers = [
    !validData &&
      "Completa el nombre, dataset, objetivo y las etiquetas positivas con al menos dos clases.",
    !recipesValid &&
      (featureDiagnostic
        ? `${featureDiagnostic.recipeName ?? "Variable"}: ${featureDiagnostic.message}`
        : "Las variables tienen cambios sin validar. Ejecuta “Validar y calcular” en el paso Variables."),
    ...contract.leaks.map(leakBlocker),
    !validHistory &&
      "Revisa los campos y nombres de las variables históricas heredadas del borrador anterior.",
    monetary && !currencyConfirmed && "Confirma que los importes usan la misma moneda.",
    !confirmed && "Confirma que las fechas de referencia corresponden al caso evaluado.",
    config.split_strategy === "temporal" &&
      !available.includes(config.time_field) &&
      "Selecciona un campo de fecha válido para la separación temporal.",
  ].filter(Boolean) as string[];
  const save = useMutation({
    mutationFn: async (train: boolean) => {
      const model = await createModel({
        data: {
          tag: tag.trim(),
          description,
          dataset_name: dataset,
          target_field: target,
          positive_labels: positive,
          feature_transforms: features,
          historical_features: history,
          training_config: config,
          alert_schema_version: schemaVersion ?? undefined,
          feature_configuration: recipeConfiguration.recipes.length
            ? recipeConfiguration
            : undefined,
        },
      });
      setSavedId(model.id);
      await client.invalidateQueries({ queryKey: ["models"] });
      if (train) {
        await trainModel({ data: { id: model.id } });
        await client.invalidateQueries({ queryKey: ["asyncOperations", "model_training"] });
      }
      return train;
    },
    onSuccess: (train) => {
      localStorage.removeItem(DRAFT_KEY);
      setNotice(
        train
          ? "Modelo guardado. Entrenamiento en cola; consulta el progreso en la tabla."
          : "Borrador guardado. Puedes entrenarlo desde la tabla de modelos.",
      );
      client.invalidateQueries({ queryKey: ["models"] });
    },
  });
  const retry = useMutation({
    mutationFn: () => trainModel({ data: { id: savedId! } }),
    onSuccess: () => {
      setNotice("Entrenamiento en cola. Consulta el progreso en la tabla.");
      client.invalidateQueries({ queryKey: ["models"] });
      client.invalidateQueries({ queryKey: ["asyncOperations", "model_training"] });
    },
  });
  const pending = save.isPending || retry.isPending;
  const resetWizard = () => {
    if (!window.confirm("¿Descartar toda la configuración actual y empezar de nuevo?")) return;
    localStorage.removeItem(DRAFT_KEY);
    setRecipeConfiguration(emptyConfiguration);
    setRecipesValid(true);
    setDraftCorrupt(false);
    setDraftMessage("");
    setStep("0");
    setTag("");
    setDescription("");
    setDataset("");
    setTarget("");
    setPositive([]);
    setFeatures([]);
    setHistory([]);
    setConfig({ ...initialConfig });
    setConfirmed(false);
    setCurrencyConfirmed(false);
    setAdvanced(false);
    setSchemaVersion(null);
    setNotice("");
  };
  return (
    <SideDrawer
      open={open}
      onOpenChange={(value) => !value && !pending && onClose()}
      size="full"
      bare
      title="Crear y entrenar modelo"
      description="Configura un modelo real sobre un dataset del sistema. Cada borrador conserva sus variables y parámetros."
    >
      <SectionTabs
        label="Pasos del entrenamiento"
        items={["Datos y objetivo", "Variables", "XGBoost", "Revisión"].map((label, i) => ({
          key: String(i),
          label,
        }))}
        value={step}
        onValueChange={setStep}
        disabled={pending || !!savedId}
        className="px-6"
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-5 text-text-primary">
        {draftMessage && (
          <p role="status" className="text-[11px] text-text-secondary">
            {draftMessage}
            {draftCorrupt && (
              <button
                className="underline ml-2"
                onClick={() => {
                  localStorage.removeItem(DRAFT_KEY);
                  setDraftCorrupt(false);
                  setDraftMessage("Borrador local restablecido.");
                }}
              >
                Descartar borrador corrupto
              </button>
            )}
          </p>
        )}
        <fieldset disabled={pending || !!savedId} className="space-y-5 disabled:opacity-70">
          {step === "0" && (
            <div className="grid md:grid-cols-[1fr_300px] gap-5">
              <section className={panel}>
                <Field label="Nombre del modelo">
                  <input
                    className={input}
                    maxLength={120}
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="xgboost-historico-v1"
                  />
                </Field>
                <Field label="Descripción">
                  <textarea
                    maxLength={2000}
                    className={textareaClass}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </Field>
                <Field label="Dataset">
                  <select
                    className={input}
                    value={dataset}
                    onChange={(e) => {
                      setDataset(e.target.value);
                      setTarget("");
                      setPositive([]);
                      setFeatures([]);
                      setHistory([]);
                      setConfirmed(false);
                      setCurrencyConfirmed(false);
                    }}
                  >
                    <option value="">Selecciona un dataset</option>
                    {datasets.data?.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name} · {d.row_count} filas
                      </option>
                    ))}
                  </select>
                </Field>
                {datasets.isError && (
                  <p role="alert" className="text-danger text-[13px]">
                    No se pudo cargar el catálogo.{" "}
                    <button className="underline" onClick={() => datasets.refetch()}>
                      Reintentar
                    </button>
                  </p>
                )}
                {summary.isFetching && <p className="text-[13px]">Cargando campos…</p>}
                {summary.isError && (
                  <p role="alert" className="text-danger text-[13px]">
                    No se pudo cargar el resumen.{" "}
                    <button className="underline" onClick={() => summary.refetch()}>
                      Reintentar
                    </button>
                  </p>
                )}
                <Field label="Campo objetivo">
                  <select
                    aria-label="Campo objetivo"
                    data-testid="target-select"
                    className={input}
                    value={target}
                    onChange={(e) => {
                      setTarget(e.target.value);
                      setPositive([]);
                      setFeatures(
                        features.filter(
                          (f) => f.field !== e.target.value && f.reference_field !== e.target.value,
                        ),
                      );
                      setHistory(
                        history.filter(
                          (r) =>
                            ![r.field, r.reference_field, r.compare_field].includes(e.target.value),
                        ),
                      );
                    }}
                  >
                    <option value="">Selecciona un campo</option>
                    {suggested.length > 0 && (
                      <optgroup label="Sugeridos por el esquema (etiqueta)">
                        {suggested.map((f) => (
                          <option key={`s-${f}`} value={f} data-testid="target-suggested">
                            {f} · etiqueta del esquema
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label={suggested.length ? "Otros campos" : "Campos del dataset"}>
                      {(summary.data?.available_fields ?? [])
                        .filter((f) => !suggested.includes(f))
                        .map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                    </optgroup>
                  </select>
                </Field>
                {targetAssessment === "not_label" && (
                  <p
                    data-testid="target-not-label"
                    role="status"
                    className="text-[13px] text-warning"
                  >
                    “{target}” no es un campo de rol etiqueta en el esquema activo
                    {schema ? ` (v${schema.version})` : ""}. Puedes usarlo, pero confirma que es el
                    desenlace que quieres predecir.
                  </p>
                )}
                <div className="space-y-2">
                  <p className="text-[13px] font-medium">
                    Valores que representan la clase positiva
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {distribution.map((v) => (
                      <label
                        key={v.value}
                        className="flex items-center gap-2 rounded border border-border p-2 text-[13px]"
                      >
                        <input
                          type="checkbox"
                          checked={positive.includes(v.value)}
                          onChange={(e) =>
                            setPositive(
                              e.target.checked
                                ? [...positive, v.value]
                                : positive.filter((p) => p !== v.value),
                            )
                          }
                        />
                        {v.value} · {v.count}
                      </label>
                    ))}
                  </div>
                  {target && !distribution.length && (
                    <p className="text-[13px] text-warning">
                      El resumen no contiene valores para este campo. Selecciona un objetivo
                      analizado.
                    </p>
                  )}
                  {target && distribution.length === 1 && (
                    <p role="alert" className="text-[13px] text-danger">
                      El campo objetivo solo tiene una clase ({distribution[0].value}). Elige un
                      dataset con al menos dos clases distintas para poder entrenar.
                    </p>
                  )}
                </div>
                <HistoryMappingControls
                  value={recipeConfiguration}
                  onChange={setRecipeConfiguration}
                  dataset={dataset}
                  target={target}
                  availableFields={available}
                  fieldAliases={fieldAliases}
                />
              </section>
              <aside className={panel}>
                <h3 className="text-[13px] font-semibold text-text-primary">Datos para evaluar</h3>
                <p className="text-[28px]">{summary.data?.total_rows?.toLocaleString() ?? "—"}</p>
                <p className="text-[13px] text-text-secondary">
                  Registros en el dataset seleccionado
                </p>
                <p className="text-[13px]">
                  Cuatro conjuntos independientes: 60% entrenamiento, 15% validación, 10%
                  calibración y 15% prueba.
                </p>
                <p className="text-[11px] text-text-secondary">
                  En separación temporal, los cortes se ajustan para mantener juntas las operaciones
                  con la misma fecha. Cada conjunto debe contener ambas clases.
                </p>
              </aside>
            </div>
          )}
          {step === "0" && !validData && missingData.length > 0 && (
            <p data-testid="wizard-step0-hint" role="status" className="text-[13px] text-warning">
              Falta: {missingData.join(", ")}.
            </p>
          )}
          {step === "1" && (
            <>
              <FeatureRecipeWorkspace
                value={recipeConfiguration}
                onChange={setRecipeConfiguration}
                dataset={dataset}
                target={target}
                availableFields={available}
                fieldAliases={fieldAliases}
                showHistorySettings={false}
                onValidity={setRecipesValid}
                onDiagnostic={setFeatureDiagnostic}
                focusRecipeId={reviewRecipeId}
                schema={schema}
              />
              {!validFeatures && (
                <p data-testid="wizard-variables-hint" className="text-[13px] text-warning">
                  Crea y valida al menos una variable de entrada activa, con nombre único (letras,
                  números y guion bajo). Pulsa “Validar y calcular” para continuar.
                </p>
              )}
            </>
          )}
          {step === "2" && (
            <section className={panel}>
              <div className="flex justify-between">
                <h3 className="text-[13px] font-semibold text-text-primary">
                  XGBoost y evaluación
                </h3>
                <button
                  className={button}
                  onClick={() => {
                    setConfig({ ...initialConfig });
                    setConfirmed(false);
                  }}
                >
                  Restablecer
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {parameters
                  .slice(0, advanced ? parameters.length : 3)
                  .map(([key, label, min, max, increment]) => (
                    <Field key={key} label={label}>
                      <input
                        type="number"
                        className={input}
                        min={min}
                        max={max}
                        step={increment}
                        value={Number.isNaN(config[key]) ? "" : Number(config[key])}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            [key]: e.target.value === "" ? NaN : Number(e.target.value),
                          })
                        }
                      />
                      <span className="text-[11px] text-text-secondary">
                        Rango {min}–{max}
                      </span>
                    </Field>
                  ))}
              </div>
              <button className={button} onClick={() => setAdvanced(!advanced)}>
                {advanced ? "Ocultar" : "Mostrar"} opciones avanzadas
              </button>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Peso de la clase positiva">
                  <select
                    className={input}
                    value={config.scale_pos_weight === null ? "auto" : "manual"}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        scale_pos_weight: e.target.value === "auto" ? null : 1,
                      })
                    }
                  >
                    <option value="auto">Automático: negativos / positivos de entrenamiento</option>
                    <option value="manual">Manual</option>
                  </select>
                </Field>
                {config.scale_pos_weight !== null && (
                  <Field label="Peso manual">
                    <input
                      type="number"
                      className={input}
                      min={0.01}
                      max={100000}
                      step={0.1}
                      value={config.scale_pos_weight}
                      onChange={(e) =>
                        setConfig({ ...config, scale_pos_weight: Number(e.target.value) })
                      }
                    />
                  </Field>
                )}
                <Field label="Separación">
                  <select
                    className={input}
                    value={config.split_strategy}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        split_strategy: e.target.value as TrainingConfig["split_strategy"],
                      })
                    }
                  >
                    <option value="temporal">Temporal</option>
                    <option value="stratified">Aleatoria estratificada</option>
                  </select>
                </Field>
                {config.split_strategy === "temporal" && (
                  <Field label="Fecha para ordenar los registros">
                    <select
                      className={input}
                      value={config.time_field}
                      onChange={(e) => {
                        setConfig({ ...config, time_field: e.target.value });
                        setConfirmed(false);
                      }}
                    >
                      <option value="">Selecciona</option>
                      {available.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Zona horaria de fechas sin offset">
                  <select
                    className={input}
                    value={config.timezone}
                    onChange={(e) => {
                      setConfig({ ...config, timezone: e.target.value });
                      setConfirmed(false);
                    }}
                  >
                    <option value="America/Bogota">America/Bogota</option>
                    <option value="UTC">UTC</option>
                  </select>
                </Field>
              </div>
              <label className="flex gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={config.early_stopping_rounds !== null}
                  onChange={(e) =>
                    setConfig({ ...config, early_stopping_rounds: e.target.checked ? 30 : null })
                  }
                />
                Parada temprana: 30 iteraciones sin mejorar log loss en validación
              </label>
              <label className="flex items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Confirmo que las fechas de referencia son las del caso evaluado y que las fechas sin
                offset usan la zona seleccionada. Las fechas con offset conservan su instante.
              </label>
              <p className="text-[11px] text-text-secondary">
                El umbral se elige por F1 en validación. La calibración utiliza un conjunto
                separado; las métricas finales se calculan en prueba.
              </p>
            </section>
          )}
          {step === "3" && (
            <div className="grid md:grid-cols-2 gap-5">
              <section className={panel}>
                <h3 className="text-[13px] font-semibold text-text-primary">
                  {tag || "Nombre pendiente"}
                </h3>
                <p className="text-[13px]">Dataset: {dataset || "Pendiente"}</p>
                <p className="text-[13px]">
                  Objetivo: {target} · positivos: {positive.join(", ")}
                </p>
                <TrainingContractSummary
                  contract={contract}
                  pinnedVersion={schemaVersion}
                  activeVersion={schema?.version ?? null}
                  validated={recipesValid}
                  onUseActive={schema ? () => setSchemaVersion(schema.version) : undefined}
                />
                {(features.some((f) => f.kind !== "drop") || history.length > 0) && (
                  <p data-testid="contract-legacy" className="text-[11px] text-text-secondary">
                    Heredado de un borrador anterior:{" "}
                    {features.filter((f) => f.kind !== "drop").length} campos directos y{" "}
                    {history.length} variables históricas.
                  </p>
                )}
                {monetary && (
                  <label className="flex items-start gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={currencyConfirmed}
                      onChange={(e) => setCurrencyConfirmed(e.target.checked)}
                    />
                    Confirmo que los importes agregados y comparados usan la misma moneda o fueron
                    convertidos previamente.
                  </label>
                )}
                {history.map((r) => (
                  <p key={r.name} className="text-[11px] bg-primary/5 p-2 rounded">
                    {r.name} · {operations.find(([k]) => k === r.operation)?.[1]} · {r.window_hours}{" "}
                    h{r.filter_field ? ` · ${r.filter_field} = ${r.filter_value}` : ""}
                  </p>
                ))}
              </section>
              <section className={panel}>
                <h3 className="text-[13px] font-semibold text-text-primary">
                  Configuración guardada con el modelo
                </h3>
                {parameters.map(([k, l]) => (
                  <div className="flex justify-between text-[13px]" key={k}>
                    <span>{l}</span>
                    <span>{String(config[k])}</span>
                  </div>
                ))}
                <p className="text-[13px]">
                  {config.split_strategy === "temporal" ? "Temporal" : "Aleatoria estratificada"} ·{" "}
                  {config.timezone}
                </p>
                <p className="text-[13px]">
                  Peso positivo: {config.scale_pos_weight ?? "Automático"} · Parada temprana:{" "}
                  {config.early_stopping_rounds ?? "Desactivada"}
                </p>
              </section>
              {!valid && (
                <div
                  role="alert"
                  className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-[13px] text-danger"
                >
                  <p className="font-medium">No se puede entrenar todavía</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-text-secondary">
                    {blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                  {!recipesValid && (
                    <button
                      type="button"
                      className="mt-2 rounded border border-danger/30 bg-background px-3 py-1.5 font-medium hover:bg-danger/5"
                      onClick={() => {
                        setReviewRecipeId(featureDiagnostic?.recipeId ?? null);
                        setStep("1");
                      }}
                    >
                      {featureDiagnostic?.recipeName
                        ? `Revisar variable “${featureDiagnostic.recipeName}”`
                        : "Ir a Variables"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </fieldset>
        {(save.isError || retry.isError) && (
          <div role="alert" className="text-[13px] text-danger">
            {savedId
              ? "El borrador está guardado, pero no se pudo iniciar el entrenamiento. "
              : "No se pudo guardar el modelo. "}
            {(retry.error ?? save.error)?.message}
            {savedId && (
              <button
                className={`${button} ml-2`}
                disabled={pending}
                onClick={() => retry.mutate()}
              >
                Reintentar entrenamiento
              </button>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-success/10 p-4 text-[13px]">
            {notice}
          </p>
        )}
      </div>
      <footer className="border-t border-border px-6 py-4 flex flex-wrap justify-between gap-3">
        <p className="text-[11px] text-text-secondary">
          {savedId
            ? "Configuración guardada en el servidor"
            : `Paso ${Number(step) + 1} de 4 · Los cambios se conservan localmente al cerrar`}
        </p>
        <div className="flex gap-2">
          {savedId ? (
            <button className={primary} disabled={pending} onClick={onClose}>
              Volver a modelos
            </button>
          ) : (
            <>
              <button
                className={`${button} text-danger border-danger`}
                disabled={pending}
                onClick={resetWizard}
              >
                Reiniciar
              </button>
              {step !== "0" && (
                <button
                  className={button}
                  disabled={pending}
                  onClick={() => setStep(String(Number(step) - 1))}
                >
                  Anterior
                </button>
              )}
              {step !== "3" ? (
                <button
                  className={primary}
                  disabled={
                    step === "0" ? !validData : step === "1" ? !validFeatures : !validConfig
                  }
                  onClick={() => setStep(String(Number(step) + 1))}
                >
                  Continuar
                </button>
              ) : (
                <>
                  <button
                    className={button}
                    disabled={!valid || pending}
                    onClick={() => save.mutate(false)}
                  >
                    Guardar borrador
                  </button>
                  <button
                    className={primary}
                    disabled={!valid || pending}
                    onClick={() => save.mutate(true)}
                  >
                    {pending ? "Guardando…" : "Guardar y entrenar"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </footer>
    </SideDrawer>
  );
}
