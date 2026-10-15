import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Eye, Loader2, Play, Plus, Trash2 } from "lucide-react";

import { createId } from "@/lib/createId";
import {
  createScenario,
  deleteScenario,
  previewScenario,
  startScenario,
  seedScenarioFromDataset,
  type FieldGenerator,
  type GeneratorKind,
  type OutputMode,
  type RateInterval,
  type SimulationScenario,
} from "@/lib/api/eventSimulation.functions";
import { getDatasets } from "@/lib/api/datasets.functions";
import { getActiveAlertSchema } from "@/lib/api/alertSchema.functions";

/* ─── Generador strategy: simulador de alertas por microservicio ─────────
   Flow forced by the backend (see previewScenario's docstring in
   eventSimulation.functions.ts): preview needs an already-persisted
   scenario, so this form always goes draft-first.
     1. Fill the form -> "Crear borrador" -> createScenario (DRAFT, id known)
     2. Form locks -> "Vista previa" -> previewScenario renders sample rows
     3. "Iniciar" -> startScenario -> navigate to the live status page
   Editing a DRAFT back via updateScenario was left out on purpose (brief's
   call to make) - simpler to lock-and-restart via "Descartar borrador",
   which also cleans up the orphaned draft server-side. */

const GENERATOR_KINDS: { value: GeneratorKind; label: string }[] = [
  { value: "CONSTANT", label: "Constante" },
  { value: "CATEGORICAL", label: "Categórico (pesos)" },
  { value: "UNIFORM", label: "Uniforme" },
  { value: "NORMAL", label: "Normal" },
  { value: "LOGNORMAL", label: "Log-normal" },
  { value: "POISSON", label: "Poisson" },
  { value: "TEMPLATE_LLM", label: "Plantilla LLM" },
  { value: "SEED_RECREATION", label: "Recreación desde dataset (LLM)" },
];

const INPUT_CLS =
  "w-full h-8 rounded-md border border-border bg-background px-2 text-[12px] focus:outline-none focus:border-primary";
const LABEL_CLS = "text-[10px] text-text-secondary block mb-0.5";

type RateIntervalRow = { id: string; start: string; end: string; eventsPerMinute: string };
type WeightRow = { id: string; key: string; weight: string };
type FieldSpecRow = {
  id: string;
  name: string;
  kind: GeneratorKind;
  value: string;
  weights: WeightRow[];
  low: string;
  high: string;
  mu: string;
  sigma: string;
  lambda: string;
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  temperature: string;
  seedDatasetName: string;
  seedField: string;
};

function newRateInterval(start = "0", end = "60", eventsPerMinute = "10"): RateIntervalRow {
  return { id: createId(), start, end, eventsPerMinute };
}

function newFieldSpec(name = "", kind: GeneratorKind = "CONSTANT", value = ""): FieldSpecRow {
  return {
    id: createId(),
    name,
    kind,
    value,
    weights: [],
    low: "",
    high: "",
    mu: "",
    sigma: "",
    lambda: "",
    systemPrompt: "",
    userPromptTemplate: "",
    model: "",
    temperature: "",
    seedDatasetName: "",
    seedField: "",
  };
}

function fieldSpecFromGenerator(name: string, generator: FieldGenerator): FieldSpecRow {
  const params = generator.params ?? {};
  return {
    ...newFieldSpec(name, generator.kind, String(generator.value ?? "")),
    weights: Object.entries(generator.weights ?? {}).map(([key, weight]) => ({
      id: createId(),
      key,
      weight: String(weight),
    })),
    low: String(params.low ?? ""),
    high: String(params.high ?? ""),
    mu: String(params.mu ?? ""),
    sigma: String(params.sigma ?? ""),
    lambda: String(params.lambda ?? ""),
  };
}

function buildFieldGenerator(row: FieldSpecRow): FieldGenerator {
  switch (row.kind) {
    case "CONSTANT":
      return { kind: "CONSTANT", value: row.value };
    case "CATEGORICAL":
      return {
        kind: "CATEGORICAL",
        weights: Object.fromEntries(
          row.weights.filter((w) => w.key.trim()).map((w) => [w.key.trim(), Number(w.weight) || 0]),
        ),
      };
    case "UNIFORM":
      return {
        kind: "UNIFORM",
        params: { low: Number(row.low) || 0, high: Number(row.high) || 0 },
      };
    case "NORMAL":
    case "LOGNORMAL":
      return { kind: row.kind, params: { mu: Number(row.mu) || 0, sigma: Number(row.sigma) || 0 } };
    case "POISSON":
      return { kind: "POISSON", params: { lambda: Number(row.lambda) || 0 } };
    case "TEMPLATE_LLM":
      return {
        kind: "TEMPLATE_LLM",
        system_prompt: row.systemPrompt || null,
        user_prompt_template: row.userPromptTemplate || null,
        model: row.model || null,
        temperature: row.temperature.trim() ? Number(row.temperature) : undefined,
      };
    case "SEED_RECREATION":
      return {
        kind: "SEED_RECREATION",
        system_prompt: row.systemPrompt || null,
        user_prompt_template: row.userPromptTemplate || null,
        model: row.model || null,
        temperature: row.temperature.trim() ? Number(row.temperature) : undefined,
        seed_dataset_name: row.seedDatasetName || null,
        seed_field: row.seedField || null,
      };
  }
}

export function GeneradorScenarioForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [outputMode, setOutputMode] = useState<OutputMode>("DATASET");
  const [targetDatasetName, setTargetDatasetName] = useState("");
  const [rateSchedule, setRateSchedule] = useState<RateIntervalRow[]>([newRateInterval()]);
  const [fieldSpecs, setFieldSpecs] = useState<FieldSpecRow[]>([newFieldSpec()]);
  const [scenario, setScenario] = useState<SimulationScenario | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[] | null>(null);
  const [seedDatasetName, setSeedDatasetName] = useState("");
  const datasetsQuery = useQuery({ queryKey: ["datasets"], queryFn: getDatasets });
  const schemaQuery = useQuery({ queryKey: ["activeAlertSchema"], queryFn: getActiveAlertSchema });

  useEffect(() => {
    if (fieldSpecs.length !== 1 || fieldSpecs[0].name || !schemaQuery.data) return;
    const defaults = schemaQuery.data.fields
      .filter(
        (field) =>
          field.data_source === "aric" && field.is_alert && !field.is_label && field.field_ds_loc,
      )
      .map((field) =>
        fieldSpecFromGenerator(
          field.field_ds_loc,
          (field.type === "number"
            ? { kind: "NORMAL", params: { mu: 0, sigma: 1 } }
            : field.type === "bool"
              ? { kind: "CATEGORICAL", weights: { true: 1, false: 1 } }
              : { kind: "CONSTANT", value: "" }) as FieldGenerator,
        ),
      );
    if (defaults.length) setFieldSpecs(defaults);
  }, [fieldSpecs, schemaQuery.data]);

  const seedMutation = useMutation({
    mutationFn: (datasetName: string) =>
      seedScenarioFromDataset({ data: { dataset_name: datasetName } }),
    onSuccess: (generators) =>
      setFieldSpecs(
        Object.entries(generators).map(([name, generator]) =>
          fieldSpecFromGenerator(name, generator),
        ),
      ),
  });

  const canCreate =
    name.trim().length > 0 &&
    (outputMode !== "DATASET" || targetDatasetName.trim().length > 0) &&
    rateSchedule.length > 0 &&
    fieldSpecs.length > 0 &&
    fieldSpecs.every((f) => f.name.trim().length > 0);

  const createMutation = useMutation({
    mutationFn: () =>
      createScenario({
        data: {
          name: name.trim(),
          output_mode: outputMode,
          target_dataset_name: outputMode === "DATASET" ? targetDatasetName.trim() : undefined,
          rate_schedule: rateSchedule.map((r): RateInterval => ({
            start_offset_seconds: Number(r.start) || 0,
            end_offset_seconds: Number(r.end) || 0,
            events_per_minute: Number(r.eventsPerMinute) || 0,
          })),
          field_specs: Object.fromEntries(
            fieldSpecs.map((f) => [f.name.trim(), buildFieldGenerator(f)]),
          ),
        },
      }),
    onSuccess: (created) => setScenario(created),
  });

  const discardMutation = useMutation({
    mutationFn: (id: string) => deleteScenario({ data: { id } }),
    onSuccess: () => {
      setScenario(null);
      setPreviewRows(null);
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => previewScenario({ data: { id: scenario!.id, count: 5 } }),
    onSuccess: (rows) => setPreviewRows(rows),
  });

  const startMutation = useMutation({
    mutationFn: () => startScenario({ data: { id: scenario!.id } }),
    onSuccess: (started) => {
      onClose();
      navigate({ to: "/testing/scenarios/$scenarioId", params: { scenarioId: started.id } });
    },
  });

  function updateRateInterval(id: string, patch: Partial<RateIntervalRow>) {
    setRateSchedule((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function updateFieldSpec(id: string, patch: Partial<FieldSpecRow>) {
    setFieldSpecs((rows) => rows.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  const locked = !!scenario;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Nombre del escenario</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={locked}
            placeholder="Ej: Pico de fraude BreB fin de mes"
            className="w-full rounded-md border border-border px-3 py-2 text-[13px] bg-background disabled:opacity-60"
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Destino de los eventos generados</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={locked}
              onClick={() => setOutputMode("DATASET")}
              className={`flex-1 h-[38px] rounded-md border text-[12px] font-medium disabled:opacity-60 ${
                outputMode === "DATASET"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-text-secondary hover:bg-surface"
              }`}
            >
              Dataset
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => setOutputMode("LIVE_PIPELINE")}
              className={`flex-1 h-[38px] rounded-md border text-[12px] font-medium disabled:opacity-60 ${
                outputMode === "LIVE_PIPELINE"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-text-secondary hover:bg-surface"
              }`}
            >
              Pipeline en vivo
            </button>
          </div>
        </div>
      </div>

      {outputMode === "DATASET" ? (
        <div>
          <label className={LABEL_CLS}>Dataset destino</label>
          <input
            value={targetDatasetName}
            onChange={(e) => setTargetDatasetName(e.target.value)}
            disabled={locked}
            placeholder="Nombre exacto de un dataset existente"
            className="w-full rounded-md border border-border px-3 py-2 text-[13px] bg-background disabled:opacity-60"
          />
          <p className="text-[10px] text-text-secondary mt-1">
            Los eventos se agregan a ese dataset a medida que se generan. Créalo primero desde la
            pestaña Dataset o Biblioteca si todavía no existe - este formulario no lo crea por ti.
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-md px-3 py-2 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Este modo despacha eventos reales al pipeline en vivo de forma continua mientras el
          escenario esté corriendo.
        </p>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] text-text-secondary">
            Curva de llegada (intervalos de tasa)
          </label>
          {!locked && (
            <button
              type="button"
              onClick={() => setRateSchedule((rows) => [...rows, newRateInterval()])}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> Agregar intervalo
            </button>
          )}
        </div>
        <div className="space-y-2">
          {rateSchedule.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
              <div>
                <label className={LABEL_CLS}>Desde (s)</label>
                <input
                  type="number"
                  value={row.start}
                  disabled={locked}
                  onChange={(e) => updateRateInterval(row.id, { start: e.target.value })}
                  className={`${INPUT_CLS} disabled:opacity-60`}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Hasta (s)</label>
                <input
                  type="number"
                  value={row.end}
                  disabled={locked}
                  onChange={(e) => updateRateInterval(row.id, { end: e.target.value })}
                  className={`${INPUT_CLS} disabled:opacity-60`}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Eventos / min</label>
                <input
                  type="number"
                  value={row.eventsPerMinute}
                  disabled={locked}
                  onChange={(e) => updateRateInterval(row.id, { eventsPerMinute: e.target.value })}
                  className={`${INPUT_CLS} disabled:opacity-60`}
                />
              </div>
              {!locked && (
                <button
                  type="button"
                  onClick={() => setRateSchedule((rows) => rows.filter((r) => r.id !== row.id))}
                  disabled={rateSchedule.length <= 1}
                  title="Quitar intervalo"
                  className="h-8 w-8 inline-flex items-center justify-center text-danger/70 hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] text-text-secondary">Campos generados por evento</label>
          {!locked && (
            <div className="flex items-center gap-3">
              <select
                aria-label="Dataset para sembrar"
                value={seedDatasetName}
                disabled={seedMutation.isPending || !datasetsQuery.data?.length}
                onChange={(event) => setSeedDatasetName(event.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-[11px]"
              >
                <option value="">Selecciona un dataset…</option>
                {(datasetsQuery.data ?? []).map((dataset) => (
                  <option key={dataset.name} value={dataset.name}>
                    {dataset.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!seedDatasetName || seedMutation.isPending}
                onClick={() => seedMutation.mutate(seedDatasetName)}
                className="h-8 rounded-md border border-primary/30 px-2 text-[11px] font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
              >
                Sembrar desde dataset
              </button>
              <button
                type="button"
                onClick={() => setFieldSpecs((rows) => [...rows, newFieldSpec()])}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Agregar campo
              </button>
            </div>
          )}
        </div>
        {!locked && (
          <p className="text-[10px] text-text-secondary mb-2">
            Las distribuciones inferidas quedan cargadas para revisión antes de crear el borrador.
          </p>
        )}
        {seedMutation.isError && (
          <p className="text-[11px] text-danger mb-2">{(seedMutation.error as Error).message}</p>
        )}
        <div className="space-y-3">
          {fieldSpecs.map((row) => (
            <FieldSpecEditor
              key={row.id}
              row={row}
              locked={locked}
              removable={fieldSpecs.length > 1}
              onChange={(patch) => updateFieldSpec(row.id, patch)}
              onRemove={() => setFieldSpecs((rows) => rows.filter((f) => f.id !== row.id))}
            />
          ))}
        </div>
      </div>

      {!locked && (
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => createMutation.mutate()}
            disabled={!canCreate || createMutation.isPending}
            className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Crear borrador
          </button>
          {createMutation.isError && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-danger">
              <AlertTriangle className="h-3.5 w-3.5" />
              {(createMutation.error as Error).message}
            </span>
          )}
        </div>
      )}

      {locked && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-[12px] text-text-secondary">
            Borrador creado (<span className="font-mono">{scenario.id}</span>). Los campos quedan
            bloqueados - descarta este borrador para volver a editar desde cero.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
              className="inline-flex items-center gap-2 border border-primary/30 text-primary px-3 py-1.5 rounded-md text-[12px] font-medium hover:bg-primary/10 disabled:opacity-40"
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              Vista previa
            </button>
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-40"
            >
              {startMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Iniciar
            </button>
            <button
              onClick={() => discardMutation.mutate(scenario.id)}
              disabled={discardMutation.isPending}
              className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary hover:text-danger disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Descartar borrador
            </button>
          </div>
          {previewMutation.isError && (
            <p className="text-[12px] text-danger">{(previewMutation.error as Error).message}</p>
          )}
          {startMutation.isError && (
            <p className="text-[12px] text-danger">{(startMutation.error as Error).message}</p>
          )}
          {previewRows && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                Filas de ejemplo
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {previewRows.map((row, i) => (
                  <pre
                    key={i}
                    className="text-[11px] bg-surface rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-words"
                  >
                    {JSON.stringify(row, null, 2)}
                  </pre>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldSpecEditor({
  row,
  locked,
  removable,
  onChange,
  onRemove,
}: {
  row: FieldSpecRow;
  locked: boolean;
  removable: boolean;
  onChange: (patch: Partial<FieldSpecRow>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="rounded-lg border border-border p-3 space-y-2.5"
      data-testid="scenario-field-editor"
      data-field-name={row.name}
    >
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <div>
          <label className={LABEL_CLS}>Nombre del campo</label>
          <input
            value={row.name}
            disabled={locked}
            onChange={(e) => onChange({ name: e.target.value })}
            className={`${INPUT_CLS} disabled:opacity-60`}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Generador</label>
          <select
            value={row.kind}
            disabled={locked}
            onChange={(e) => onChange({ kind: e.target.value as GeneratorKind })}
            className={`${INPUT_CLS} disabled:opacity-60`}
          >
            {GENERATOR_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        {!locked && removable && (
          <button
            type="button"
            onClick={onRemove}
            title="Quitar campo"
            className="h-8 w-8 inline-flex items-center justify-center text-danger/70 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {row.kind === "CONSTANT" && (
        <div>
          <label className={LABEL_CLS}>Valor</label>
          <input
            value={row.value}
            disabled={locked}
            onChange={(e) => onChange({ value: e.target.value })}
            className={`${INPUT_CLS} disabled:opacity-60`}
          />
        </div>
      )}

      {row.kind === "CATEGORICAL" && (
        <div className="space-y-1.5">
          <label className={LABEL_CLS}>Opciones (valor : peso)</label>
          {row.weights.map((w) => (
            <div key={w.id} className="grid grid-cols-[1fr_100px_auto] gap-2">
              <input
                value={w.key}
                disabled={locked}
                placeholder="valor"
                onChange={(e) =>
                  onChange({
                    weights: row.weights.map((x) =>
                      x.id === w.id ? { ...x, key: e.target.value } : x,
                    ),
                  })
                }
                className={`${INPUT_CLS} disabled:opacity-60`}
              />
              <input
                type="number"
                value={w.weight}
                disabled={locked}
                placeholder="peso"
                onChange={(e) =>
                  onChange({
                    weights: row.weights.map((x) =>
                      x.id === w.id ? { ...x, weight: e.target.value } : x,
                    ),
                  })
                }
                className={`${INPUT_CLS} disabled:opacity-60`}
              />
              {!locked && (
                <button
                  type="button"
                  onClick={() => onChange({ weights: row.weights.filter((x) => x.id !== w.id) })}
                  className="h-8 w-8 inline-flex items-center justify-center text-danger/70 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {!locked && (
            <button
              type="button"
              onClick={() =>
                onChange({ weights: [...row.weights, { id: createId(), key: "", weight: "1" }] })
              }
              className="text-[11px] font-medium text-primary hover:underline"
            >
              + Agregar opción
            </button>
          )}
        </div>
      )}

      {row.kind === "UNIFORM" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL_CLS}>Mínimo</label>
            <input
              type="number"
              value={row.low}
              disabled={locked}
              onChange={(e) => onChange({ low: e.target.value })}
              className={`${INPUT_CLS} disabled:opacity-60`}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Máximo</label>
            <input
              type="number"
              value={row.high}
              disabled={locked}
              onChange={(e) => onChange({ high: e.target.value })}
              className={`${INPUT_CLS} disabled:opacity-60`}
            />
          </div>
        </div>
      )}

      {(row.kind === "NORMAL" || row.kind === "LOGNORMAL") && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL_CLS}>Mu</label>
            <input
              type="number"
              value={row.mu}
              disabled={locked}
              onChange={(e) => onChange({ mu: e.target.value })}
              className={`${INPUT_CLS} disabled:opacity-60`}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Sigma</label>
            <input
              type="number"
              value={row.sigma}
              disabled={locked}
              onChange={(e) => onChange({ sigma: e.target.value })}
              className={`${INPUT_CLS} disabled:opacity-60`}
            />
          </div>
        </div>
      )}

      {row.kind === "POISSON" && (
        <div>
          <label className={LABEL_CLS}>Lambda</label>
          <input
            type="number"
            value={row.lambda}
            disabled={locked}
            onChange={(e) => onChange({ lambda: e.target.value })}
            className={`${INPUT_CLS} disabled:opacity-60`}
          />
        </div>
      )}

      {(row.kind === "TEMPLATE_LLM" || row.kind === "SEED_RECREATION") && (
        <div className="space-y-2">
          {row.kind === "SEED_RECREATION" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLS}>Dataset semilla</label>
                <input
                  value={row.seedDatasetName}
                  disabled={locked}
                  onChange={(e) => onChange({ seedDatasetName: e.target.value })}
                  className={`${INPUT_CLS} disabled:opacity-60`}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Campo semilla</label>
                <input
                  value={row.seedField}
                  disabled={locked}
                  onChange={(e) => onChange({ seedField: e.target.value })}
                  className={`${INPUT_CLS} disabled:opacity-60`}
                />
              </div>
            </div>
          )}
          <div>
            <label className={LABEL_CLS}>System prompt</label>
            <textarea
              value={row.systemPrompt}
              disabled={locked}
              rows={2}
              onChange={(e) => onChange({ systemPrompt: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] disabled:opacity-60"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>
              User prompt template
              {row.kind === "SEED_RECREATION"
                ? " ({other_field} y {seed_value} se resuelven al generar)"
                : " ({other_field} se resuelve contra campos ya declarados)"}
            </label>
            <textarea
              value={row.userPromptTemplate}
              disabled={locked}
              rows={2}
              onChange={(e) => onChange({ userPromptTemplate: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] disabled:opacity-60"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL_CLS}>Modelo</label>
              <input
                value={row.model}
                disabled={locked}
                placeholder="Ej: gpt-4o-mini"
                onChange={(e) => onChange({ model: e.target.value })}
                className={`${INPUT_CLS} disabled:opacity-60`}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Temperatura</label>
              <input
                type="number"
                step="0.1"
                value={row.temperature}
                disabled={locked}
                onChange={(e) => onChange({ temperature: e.target.value })}
                className={`${INPUT_CLS} disabled:opacity-60`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
