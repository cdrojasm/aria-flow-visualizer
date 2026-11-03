import { FeatureRecipeWorkspace, HistoryMappingControls, type FeatureDiagnostic } from "./FeatureRecipeWorkspace";
import {
  emptyConfiguration,
  parseConfiguration,
  type FeatureConfiguration,
} from "@/lib/api/feature-recipes.functions";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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

const input = "w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary";
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
  const [query, setQuery] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("aria.model-training.draft.v1");
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
        "aria.model-training.draft.v1",
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
        }),
      );
    } catch {
      setDraftMessage("No se pudo guardar localmente. Exporta las recetas para conservarlas.");
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
  const alertFieldMapping = useQuery({
    queryKey: ["alertFieldMapping", dataset],
    queryFn: () => getAlertFieldMapping({ data: { name: dataset } }),
    enabled: !!dataset,
  });
  const fieldAliases: Record<string, string[]> = Object.create(null);
  for (const [alertField, datasetField] of Object.entries(alertFieldMapping.data?.mappings ?? {})) {
    (fieldAliases[datasetField] ??= []).push(alertField);
  }
  const available = (
    summary.data?.available_fields ?? Object.keys(summary.data?.field_distributions ?? {})
  ).filter((f) => f !== target);
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
  const valid = validData && validFeatures && validConfig;
  const blockers = [
    !validData && "Completa el nombre, dataset, objetivo y las etiquetas positivas con al menos dos clases.",
    !recipesValid &&
      (featureDiagnostic
        ? `${featureDiagnostic.recipeName ?? "Característica"}: ${featureDiagnostic.message}`
        : "Ingeniería de características tiene cambios sin validar. Ejecuta “Validar y calcular”."),
    !validHistory && "Revisa los campos y nombres de las características históricas.",
    monetary && !currencyConfirmed && "Confirma que los importes usan la misma moneda.",
    !confirmed && "Confirma que las fechas de referencia corresponden al caso evaluado.",
    config.split_strategy === "temporal" && !available.includes(config.time_field) &&
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
      localStorage.removeItem("aria.model-training.draft.v1");
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
  const updateRecipe = (index: number, patch: Partial<HistoricalFeature>) =>
    setHistory(history.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addHistory = (operation: HistoricalFeature["operation"]) => {
    const used = new Set(history.map((r) => r.name));
    let number = history.length + 1;
    while (used.has(`${operation}_${number}`)) number++;
    setHistory([
      ...history,
      {
        name: `${operation}_${number}`,
        field: available.find((f) => f === "transacciones_json") ?? "",
        reference_field: available.includes(config.time_field) ? config.time_field : "",
        time_field: "eventtime",
        value_field: operation === "distinct" ? "destino" : "amount_value",
        operation,
        window_hours: 24,
        filter_field: null,
        filter_value: null,
        compare_field: null,
      },
    ]);
  };
  const chooseField = (field: string, kind: FieldTransformKind) =>
    setFeatures([
      ...features.filter((f) => f.field !== field),
      { field, kind, reference_field: null, top_n: 30 },
    ]);
  const resetWizard = () => {
    if (!window.confirm("¿Descartar toda la configuración actual y empezar de nuevo?")) return;
    localStorage.removeItem("aria.model-training.draft.v1");
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
    setQuery("");
    setNotice("");
  };
  return (
    <SideDrawer
      open={open}
      onOpenChange={(value) => !value && !pending && onClose()}
      size="full"
      bare
      title="Crear y entrenar modelo"
      description="Configura un modelo real sobre un dataset del sistema. Cada borrador conserva sus características y parámetros."
    >
        <SectionTabs
          label="Pasos del entrenamiento"
          items={["Datos y objetivo", "Características", "XGBoost", "Revisión"].map((label, i) => ({
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
                    localStorage.removeItem("aria.model-training.draft.v1");
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
                      className={input}
                      value={target}
                      onChange={(e) => {
                        setTarget(e.target.value);
                        setPositive([]);
                        setFeatures(
                          features.filter(
                            (f) =>
                              f.field !== e.target.value && f.reference_field !== e.target.value,
                          ),
                        );
                        setHistory(
                          history.filter(
                            (r) =>
                              ![r.field, r.reference_field, r.compare_field].includes(
                                e.target.value,
                              ),
                          ),
                        );
                      }}
                    >
                      <option value="">Selecciona un campo</option>
                      {(summary.data?.available_fields ?? []).map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="space-y-2">
                    <p className="text-[13px] font-medium">Valores que representan la clase positiva</p>
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
                    En separación temporal, los cortes se ajustan para mantener juntas las
                    operaciones con la misma fecha. Cada conjunto debe contener ambas clases.
                  </p>
                </aside>
              </div>
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
                />
                {/* The visual workspace above replaces the legacy field/history panels. */}
                <div className="hidden" aria-hidden="true">
                  <section className={panel}>
                    <h3 className="text-[13px] font-semibold text-text-primary">Campos de la operación actual</h3>
                    <input
                      aria-label="Buscar campos"
                      className={input}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar un campo…"
                    />
                    <div className="grid sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                      {available
                        .filter((f) => f.toLowerCase().includes(query.toLowerCase()))
                        .map((field) => (
                          <Field key={field} label={field}>
                            <select
                              className={input}
                              value={features.find((f) => f.field === field)?.kind ?? "drop"}
                              onChange={(e) =>
                                chooseField(field, e.target.value as FieldTransformKind)
                              }
                            >
                              {kinds.map(([k, l]) => (
                                <option key={k} value={k}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </Field>
                        ))}
                    </div>
                    <p className="text-[11px] text-text-secondary">
                      El objetivo se excluye automáticamente. Incluye solo información disponible al
                      evaluar la operación; evita etiquetas de revisión, fechas de marcación y
                      agregados calculados posteriormente.
                    </p>
                  </section>
                  <section className={panel}>
                    <div className="flex flex-wrap justify-between gap-3">
                      <h3 className="text-[13px] font-semibold text-text-primary">Características históricas</h3>
                      <div className="flex gap-2 flex-wrap">
                        <button className={button} onClick={() => addHistory("count")}>
                          <Plus className="inline h-4 w-4" /> Actividad
                        </button>
                        <button className={button} onClick={() => addHistory("median")}>
                          + Importe
                        </button>
                        <button className={button} onClick={() => addHistory("distinct")}>
                          + Destinos distintos
                        </button>
                        <button className={button} onClick={() => addHistory("recency")}>
                          + Recencia
                        </button>
                      </div>
                    </div>
                    <p className="text-[13px] text-text-secondary">
                      Cada receta usa exclusivamente eventos anteriores a la fecha del caso. Los
                      filtros son valores literales del historial; las comparaciones con destino o
                      canal actuales aún no están habilitadas.
                    </p>
                    {history.map((r, i) => (
                      <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                        <div className="flex gap-3 items-end">
                          <div className="flex-1">
                            <Field label="Nombre único">
                              <input
                                className={input}
                                value={r.name}
                                onChange={(e) => updateRecipe(i, { name: e.target.value })}
                              />
                            </Field>
                          </div>
                          <button
                            aria-label={`Eliminar ${r.name}`}
                            className={button}
                            onClick={() => setHistory(history.filter((_, j) => j !== i))}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <Field label="Campo JSON del historial">
                            <select
                              className={input}
                              value={r.field}
                              onChange={(e) => updateRecipe(i, { field: e.target.value })}
                            >
                              <option value="">Selecciona</option>
                              {available.map((f) => (
                                <option key={f}>{f}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Fecha de la operación actual">
                            <select
                              className={input}
                              value={r.reference_field}
                              onChange={(e) => updateRecipe(i, { reference_field: e.target.value })}
                            >
                              <option value="">Selecciona</option>
                              {available.map((f) => (
                                <option key={f}>{f}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Fecha dentro de cada evento">
                            <input
                              className={input}
                              value={r.time_field}
                              onChange={(e) => updateRecipe(i, { time_field: e.target.value })}
                            />
                          </Field>
                          <Field label="Ventana anterior">
                            <select
                              className={input}
                              value={r.window_hours}
                              onChange={(e) =>
                                updateRecipe(i, { window_hours: Number(e.target.value) })
                              }
                            >
                              {[
                                [1, "1 hora"],
                                [24, "24 horas"],
                                [168, "7 días"],
                                [720, "30 días"],
                                [2160, "90 días"],
                              ].map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Cálculo">
                            <select
                              className={input}
                              value={r.operation}
                              onChange={(e) =>
                                updateRecipe(i, {
                                  operation: e.target.value as HistoricalFeature["operation"],
                                  compare_field: null,
                                })
                              }
                            >
                              {operations.map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </Field>
                          {!["count", "recency"].includes(r.operation) && (
                            <Field label="Campo a agregar dentro del evento">
                              <input
                                className={input}
                                value={r.value_field}
                                onChange={(e) => updateRecipe(i, { value_field: e.target.value })}
                              />
                            </Field>
                          )}
                          <Field label="Filtrar eventos">
                            <select
                              className={input}
                              value={r.filter_field ?? ""}
                              onChange={(e) =>
                                updateRecipe(i, {
                                  filter_field: (e.target.value ||
                                    null) as HistoricalFeature["filter_field"],
                                  filter_value: e.target.value ? "" : null,
                                })
                              }
                            >
                              <option value="">Todos</option>
                              <option value="tipo_transaccion">Tipo de transacción</option>
                              <option value="integrationpoint">Punto de integración</option>
                              <option value="canal">Canal</option>
                            </select>
                          </Field>
                          {r.filter_field && (
                            <Field label="Valor exacto del filtro">
                              <input
                                className={input}
                                value={r.filter_value ?? ""}
                                onChange={(e) => updateRecipe(i, { filter_value: e.target.value })}
                              />
                            </Field>
                          )}
                          {["sum", "median", "mean", "max"].includes(r.operation) && (
                            <Field label="Comparar: campo actual / resultado">
                              <select
                                className={input}
                                value={r.compare_field ?? ""}
                                onChange={(e) =>
                                  updateRecipe(i, { compare_field: e.target.value || null })
                                }
                              >
                                <option value="">Sin comparación</option>
                                {available.map((f) => (
                                  <option key={f}>{f}</option>
                                ))}
                              </select>
                            </Field>
                          )}
                        </div>
                        <p className="text-[11px] text-text-secondary">
                          Columna: history__{r.name}. Historial ausente → valor ausente. Historial
                          vacío → conteo 0; importe y recencia ausentes. Fechas o JSON inválidos
                          detienen el entrenamiento.
                        </p>
                      </div>
                    ))}
                    {monetary && (
                      <label className="flex items-start gap-2 text-[13px]">
                        <input
                          type="checkbox"
                          checked={currencyConfirmed}
                          onChange={(e) => setCurrencyConfirmed(e.target.checked)}
                        />
                        Confirmo que los importes agregados y comparados usan la misma moneda o
                        fueron convertidos previamente.
                      </label>
                    )}
                  </section>
                  {!validFeatures && (
                    <p className="text-[13px] text-warning">
                      Selecciona características y completa las recetas con nombres únicos (letras,
                      números y guion bajo). Confirma la moneda si agregas importes.
                    </p>
                  )}
                </div>
              </>
            )}
            {step === "2" && (
              <section className={panel}>
                <div className="flex justify-between">
                  <h3 className="text-[13px] font-semibold text-text-primary">XGBoost y evaluación</h3>
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
                      <option value="auto">
                        Automático: negativos / positivos de entrenamiento
                      </option>
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
                  Confirmo que las fechas de referencia son las del caso evaluado y que las fechas
                  sin offset usan la zona seleccionada. Las fechas con offset conservan su instante.
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
                  <h3 className="text-[13px] font-semibold text-text-primary">{tag || "Nombre pendiente"}</h3>
                  <p className="text-[13px]">Dataset: {dataset || "Pendiente"}</p>
                  <p className="text-[13px]">
                    Objetivo: {target} · positivos: {positive.join(", ")}
                  </p>
                  <p className="text-[13px]">
                    {features.filter((f) => f.kind !== "drop").length} campos · {history.length}{" "}
                    recetas históricas
                  </p>
                  {recipeConfiguration.recipes.map((r) => (
                    <p key={r.id} className="text-[11px] bg-primary/5 p-2 rounded">
                      {r.name} · {r.enabled ? "Activa" : "Desactivada"} ·{" "}
                      {r.steps.map((s) => s.operation).join(" → ")} ·{" "}
                      {recipesValid ? "Validada" : "Validación pendiente"}
                    </p>
                  ))}
                  {history.map((r) => (
                    <p key={r.name} className="text-[11px] bg-primary/5 p-2 rounded">
                      {r.name} · {operations.find(([k]) => k === r.operation)?.[1]} ·{" "}
                      {r.window_hours} h
                      {r.filter_field ? ` · ${r.filter_field} = ${r.filter_value}` : ""}
                    </p>
                  ))}
                </section>
                <section className={panel}>
                  <h3 className="text-[13px] font-semibold text-text-primary">Configuración guardada con el modelo</h3>
                  {parameters.map(([k, l]) => (
                    <div className="flex justify-between text-[13px]" key={k}>
                      <span>{l}</span>
                      <span>{String(config[k])}</span>
                    </div>
                  ))}
                  <p className="text-[13px]">
                    {config.split_strategy === "temporal" ? "Temporal" : "Aleatoria estratificada"}{" "}
                    · {config.timezone}
                  </p>
                  <p className="text-[13px]">
                    Peso positivo: {config.scale_pos_weight ?? "Automático"} · Parada temprana:{" "}
                    {config.early_stopping_rounds ?? "Desactivada"}
                  </p>
                </section>
                {!valid && (
                  <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-[13px] text-danger">
                    <p className="font-medium">No se puede entrenar todavía</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-text-secondary">
                      {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
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
                          ? `Revisar mapping “${featureDiagnostic.recipeName}”`
                          : "Ir a Ingeniería de características"}
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
