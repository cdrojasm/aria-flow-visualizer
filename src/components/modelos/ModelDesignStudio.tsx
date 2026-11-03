import {
  FeatureEngineering,
  initialDefinitions,
  sampleTransaction,
  validDefinitions,
} from "./FeatureEngineering";
import { SectionTabs } from "@/components/ui/section-tabs";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FlaskConical,
  Trash2,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const input =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const button =
  "rounded-md border border-border px-3 py-2 text-sm hover:bg-primary/5 disabled:opacity-40";
const primary = `${button} bg-primary text-white hover:bg-primary/90`;
const panel = "rounded-xl border border-border bg-card p-4 space-y-3";
const steps = ["Datos y objetivo", "Características", "XGBoost", "Revisión"];
type Recipe = {
  id: number;
  name: string;
  hours: number;
  operation: string;
  filter: string;
  compare: boolean;
};
type Config = Record<string, number>;
const defaults: Config = {
  n_estimators: 400,
  max_depth: 4,
  learning_rate: 0.03,
  subsample: 0.8,
  colsample_bytree: 0.8,
  reg_lambda: 1,
  min_child_weight: 3,
};
const params: [string, string, string, number, number, number][] = [
  [
    "n_estimators",
    "Número de árboles",
    "Límite de iteraciones de aprendizaje.",
    1,
    5000,
    1,
  ],
  [
    "max_depth",
    "Profundidad máxima",
    "Mayor profundidad permite relaciones más complejas.",
    1,
    16,
    1,
  ],
  [
    "learning_rate",
    "Tasa de aprendizaje",
    "Controla cuánto aporta cada árbol.",
    0.001,
    1,
    0.001,
  ],
  [
    "subsample",
    "Proporción de filas",
    "Fracción de filas utilizada por árbol.",
    0.1,
    1,
    0.1,
  ],
  [
    "colsample_bytree",
    "Proporción de columnas",
    "Fracción de características utilizada por árbol.",
    0.1,
    1,
    0.1,
  ],
  [
    "reg_lambda",
    "Regularización L2",
    "Penaliza pesos grandes para controlar complejidad.",
    0,
    100,
    0.1,
  ],
  [
    "min_child_weight",
    "Peso mínimo de un nodo",
    "Limita divisiones con poco soporte.",
    0,
    100,
    1,
  ],
];
const windows = [
  [1, "1 hora"],
  [24, "24 horas"],
  [168, "7 días"],
  [720, "30 días"],
  [2160, "90 días"],
] as const;
// Fictional fixture: offsets are relative to the current transaction, with no customer data.
const history = [
  { hours: -2, amount: 180, destination: "A", channel: "App" },
  { hours: 0, amount: 120, destination: "A", channel: "App" },
  { hours: 0.5, amount: 40, destination: "A", channel: "App" },
  { hours: 4, amount: 80, destination: "B", channel: "Web" },
  { hours: 20, amount: null, destination: null, channel: null },
  { hours: 48, amount: 100, destination: "A", channel: "App" },
  { hours: 240, amount: 60, destination: "C", channel: "App" },
  { hours: 800, amount: 200, destination: "A", channel: "Web" },
];
function preview(recipe: Recipe) {
  const rows = history.map((r) => ({
    ...r,
    reason:
      r.hours <= 0
        ? "Posterior o simultáneo"
        : r.hours > recipe.hours
          ? "Fuera de ventana"
          : recipe.filter === "destination" && r.destination !== "A"
            ? "Otro destino o sin destino"
            : recipe.filter === "channel" && r.channel !== "App"
              ? "Otro canal o sin canal"
              : recipe.operation !== "count" &&
                  recipe.operation !== "distinct" &&
                  r.amount === null
                ? "Sin importe"
                : recipe.operation === "distinct" && !r.destination
                  ? "Sin destino"
                  : "Incluida",
  }));
  const included = rows.filter((r) => r.reason === "Incluida");
  const amounts = included
    .flatMap((r) => (r.amount === null ? [] : [r.amount]))
    .sort((a, b) => a - b);
  const value =
    recipe.operation === "count"
      ? included.length
      : recipe.operation === "distinct"
        ? new Set(included.map((r) => r.destination)).size
        : !amounts.length
          ? null
          : recipe.operation === "sum"
            ? amounts.reduce((a, b) => a + b, 0)
            : amounts.length % 2
              ? amounts[Math.floor(amounts.length / 2)]
              : (amounts[amounts.length / 2 - 1] +
                  amounts[amounts.length / 2]) /
                2;
  return {
    rows,
    value: recipe.compare ? (value ? 120 / value : null) : value,
    support: included.length,
  };
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      {" "}
      <span>{label}</span>
      {children}
    </label>
  );
}
const evaluations = Array.from({ length: 200 }, (_, i) => ({
  fraud: i < 40,
  score: i < 40 ? 0.2 + (i % 20) * 0.04 : 0.02 + (i % 40) * 0.018,
}));
function metrics(threshold: number) {
  const tp = evaluations.filter((r) => r.fraud && r.score >= threshold).length;
  const fp = evaluations.filter((r) => !r.fraud && r.score >= threshold).length;
  const fn = 40 - tp;
  const tn = 160 - fp;
  return {
    tp,
    fp,
    fn,
    tn,
    precision: tp + fp ? tp / (tp + fp) : 0,
    recall: tp / 40,
    f1: (2 * tp) / (2 * tp + fp + fn),
    alerts: tp + fp,
  };
}

// Metrics derived from the same fictional scores as the threshold explorer.
const positives = evaluations.filter((r) => r.fraud);
const negatives = evaluations.filter((r) => !r.fraud);
const rocAuc =
  positives.reduce(
    (sum, p) =>
      sum +
      negatives.reduce(
        (n, q) => n + (p.score > q.score ? 1 : p.score === q.score ? 0.5 : 0),
        0,
      ),
    0,
  ) /
  (positives.length * negatives.length);
const scoreLevels = [...new Set(evaluations.map((r) => r.score))].sort(
  (a, b) => b - a,
);
let lastRecall = 0;
const averagePrecision = scoreLevels.reduce((sum, score) => {
  const m = metrics(score);
  const area = (m.recall - lastRecall) * m.precision;
  lastRecall = m.recall;
  return sum + area;
}, 0);
const brier =
  evaluations.reduce((sum, r) => sum + (r.score - Number(r.fraud)) ** 2, 0) /
  evaluations.length;
const logLoss =
  -evaluations.reduce(
    (sum, r) => sum + (r.fraud ? Math.log(r.score) : Math.log(1 - r.score)),
    0,
  ) / evaluations.length;

export function ModelDesignStudio({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [definitions, setDefinitions] = useState(initialDefinitions);
  const [sampleJson, setSampleJson] = useState(sampleTransaction);
  const [historyHours, setHistoryHours] = useState(24);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("xgboost-historico-v1");
  const [description, setDescription] = useState("");
  const [positive, setPositive] = useState("");
  const [split, setSplit] = useState("temporal");
  const [fields, setFields] = useState<Record<string, string>>({
    amount_value: "numeric",
    channel: "categorical",
    integrationpoint: "categorical",
    fecha_transaccion: "date",
    biocatch_score: "numeric",
    deviceid: "drop",
  });
  const [recipes, setRecipes] = useState<Recipe[]>([
    {
      id: 1,
      name: "actividad_24h",
      hours: 24,
      operation: "count",
      filter: "all",
      compare: false,
    },
  ]);
  const [selected, setSelected] = useState(1);
  const [config, setConfig] = useState<Config>({ ...defaults });
  const [advanced, setAdvanced] = useState(false);
  const [weight, setWeight] = useState("auto");
  const [manualWeight, setManualWeight] = useState(1);
  const [early, setEarly] = useState(true);
  const [result, setResult] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("Desempeño");
  const [threshold, setThreshold] = useState(0.5);
  const current = recipes.find((r) => r.id === selected);
  const calculated = current ? preview(current) : null;
  const m = metrics(threshold);
  const validParams =
    params.every(
      ([key, , , min, max, increment]) =>
        Number.isFinite(config[key]) &&
        config[key] >= min &&
        config[key] <= max &&
        (increment !== 1 || Number.isInteger(config[key])),
    ) &&
    (weight === "auto" || (Number.isFinite(manualWeight) && manualWeight > 0));
  const validData = !!name.trim() && !!positive.trim();
  const validFeatures =
    validDefinitions(definitions, sampleJson, historyHours) &&
    (Object.values(fields).some((v) => v !== "drop") ||
      recipes.length > 0 ||
      definitions.length > 0) &&
    recipes.every((r) => r.name.trim()) &&
    new Set(recipes.map((r) => r.name.trim())).size === recipes.length;
  const update = (patch: Partial<Recipe>) => {
    setRecipes((all) =>
      all.map((r) => (r.id === selected ? { ...r, ...patch } : r)),
    );
    setSaved(false);
  };
  const add = (operation: string, filter: string, title: string) => {
    const id = Date.now();
    setRecipes((all) => [
      ...all,
      {
        id,
        name: `${title}_${all.length + 1}`,
        operation,
        filter,
        hours: 720,
        compare: false,
      },
    ]);
    setSelected(id);
    setSaved(false);
  };
  const download = () => {
    const recipe = {
      prototype: true,
      name,
      description,
      dataset: "Muestra_total_ARIA_Ver2_2.csv",
      target: "marcacion_final",
      positive,
      split,
      fields,
      recipes,
      feature_engineering: {
        definitions,
        history_hours: historyHours,
        sample: JSON.parse(sampleJson),
      },
      xgboost: config,
      weight: weight === "auto" ? "auto" : manualWeight,
      early_stopping: early,
      temporal_cutoff: "eventtime < fecha_transaccion",
      timezone_confirmed: false,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "aria-modelo-borrador.json";
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-w-6xl w-[96vw] h-[90vh] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 py-5 border-b border-border pr-12">
          <div className="flex items-center gap-2 text-xs text-primary">
            <FlaskConical className="h-4 w-4" /> PROTOTIPO · DATOS DE EJEMPLO
          </div>
          <DialogTitle>
            {result ? `Resultados · ${name}` : "Crear modelo XGBoost"}
          </DialogTitle>
          <DialogDescription>
            Diseña la configuración y explora resultados simulados. El borrador
            se descarga; no crea ni entrena modelos en el servidor.
          </DialogDescription>
        </DialogHeader>
        {!result && (
          <SectionTabs
            label="Pasos de creación del modelo"
            items={steps.map((label, index) => ({ key: String(index), label }))}
            value={String(step)}
            onValueChange={(value) => setStep(Number(value))}
            className="px-6"
          />
        )}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-text-primary">
          {!result && step === 0 && (
            <div className="grid gap-6 md:grid-cols-[1fr_320px]">
              <section className={panel}>
                <h3 className="font-semibold">
                  Define qué aprenderá el modelo
                </h3>
                <Field label="Nombre de versión">
                  <input
                    className={input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="Descripción">
                  <textarea
                    className={input}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Qué quieres evaluar con esta versión"
                  />
                </Field>
                <Field label="Dataset de referencia">
                  <input
                    className={input}
                    readOnly
                    value="Muestra_total_ARIA_Ver2_2.csv"
                  />
                </Field>
                <Field label="Campo objetivo">
                  <input className={input} readOnly value="marcacion_final" />
                </Field>
                <Field label="Valor que representa fraude">
                  <input
                    className={input}
                    value={positive}
                    onChange={(e) => setPositive(e.target.value)}
                    placeholder="Introduce la etiqueta positiva"
                  />
                </Field>
                <Field label="Separación de datos">
                  <select
                    className={input}
                    value={split}
                    onChange={(e) => setSplit(e.target.value)}
                  >
                    <option value="temporal">
                      Temporal: evaluar operaciones posteriores
                    </option>
                    <option value="stratified">Aleatoria estratificada</option>
                  </select>
                </Field>
                <p className="text-xs text-text-secondary">
                  Se contemplan conjuntos independientes de entrenamiento,
                  validación, calibración y prueba. Sus tamaños se definirán con
                  la disponibilidad de positivos.
                </p>
              </section>
              <aside className={panel}>
                <h3 className="font-semibold">
                  Estructura del archivo revisado
                </h3>
                <div className="text-3xl font-semibold">
                  2.362 <span className="text-sm font-normal">registros</span>
                </div>
                <p className="text-sm">
                  275.520 entradas históricas · 14 historiales vacíos
                </p>
                <p className="text-sm">
                  7.780 eventos solo tienen fecha y tipo. Pueden participar en
                  conteos, pero no en estadísticas de importe.
                </p>
                <div className="rounded-lg bg-warning/10 p-3 text-sm">
                  Corte propuesto: eventtime anterior a fecha_transaccion. Zona
                  horaria pendiente de confirmar.
                </div>
                <p className="text-xs text-text-secondary">
                  El prototipo usa ejemplos ficticios para las vistas previas.
                  No carga información personal del CSV.
                </p>
              </aside>
            </div>
          )}
          {!result && step === 1 && (
            <>
              <FeatureEngineering
                definitions={definitions}
                onChange={(value) => {
                  setDefinitions(value);
                  setSaved(false);
                }}
                json={sampleJson}
                onJsonChange={(value) => {
                  setSampleJson(value);
                  setSaved(false);
                }}
                hours={historyHours}
                onHoursChange={(value) => {
                  setHistoryHours(value);
                  setSaved(false);
                }}
              />
              <section className={panel}>
                <h3 className="font-semibold">Campos de la operación actual</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(fields).map(([field, kind]) => (
                    <Field key={field} label={field}>
                      <select
                        className={input}
                        value={kind}
                        onChange={(e) =>
                          setFields({ ...fields, [field]: e.target.value })
                        }
                      >
                        <option value="numeric">Numérico</option>
                        <option value="categorical">Categórico</option>
                        <option value="date">
                          Fecha → hora y día de semana
                        </option>
                        <option value="drop">Excluir</option>
                      </select>
                    </Field>
                  ))}
                </div>
                <p className="text-xs text-text-secondary">
                  marcacion_final está reservado como objetivo. Las fechas de
                  marcación y los datos personales no se incluyen en esta
                  selección inicial.
                </p>
              </section>
              <section className={panel}>
                <div>
                  <h3 className="font-semibold">
                    Historial · transacciones_json
                  </h3>
                  <p className="text-sm text-text-secondary mt-1">
                    Crea una receta por ventana. Los filtros se aplican antes de
                    calcular la característica.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={button}
                    onClick={() => add("count", "all", "actividad")}
                  >
                    + Actividad
                  </button>
                  <button
                    className={button}
                    onClick={() => add("median", "all", "importe_mediano")}
                  >
                    + Importes
                  </button>
                  <button
                    className={button}
                    onClick={() => add("distinct", "all", "destinos_distintos")}
                  >
                    + Destinos
                  </button>
                  <button
                    className={button}
                    onClick={() => add("count", "channel", "actividad_canal")}
                  >
                    + Canal actual
                  </button>
                  <button
                    className={button}
                    onClick={() =>
                      add("count", "destination", "actividad_destino")
                    }
                  >
                    + Destino actual
                  </button>
                </div>
                <div className="grid lg:grid-cols-[200px_1fr_1fr] gap-4">
                  <div className="space-y-2">
                    {recipes.map((r) => (
                      <div
                        key={r.id}
                        className={`flex items-center rounded-md border ${selected === r.id ? "border-primary bg-primary/5" : "border-border"}`}
                      >
                        <button
                          className="min-w-0 flex-1 truncate p-2 text-left text-sm"
                          onClick={() => setSelected(r.id)}
                        >
                          {r.name || "Sin nombre"}
                        </button>
                        <button
                          aria-label={`Eliminar ${r.name}`}
                          className="p-2 text-text-secondary"
                          onClick={() => {
                            setRecipes(recipes.filter((x) => x.id !== r.id));
                            if (selected === r.id)
                              setSelected(
                                recipes.find((x) => x.id !== r.id)?.id ?? 0,
                              );
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {!recipes.length && (
                      <p className="text-sm text-text-secondary">
                        Selecciona una plantilla para comenzar.
                      </p>
                    )}
                  </div>
                  {current && calculated && (
                    <>
                      <div className="space-y-3">
                        <Field label="Nombre de la característica">
                          <input
                            className={input}
                            value={current.name}
                            onChange={(e) => update({ name: e.target.value })}
                          />
                        </Field>
                        <Field label="Ventana anterior a la operación">
                          <select
                            className={input}
                            value={current.hours}
                            onChange={(e) =>
                              update({ hours: Number(e.target.value) })
                            }
                          >
                            {windows.map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Operaciones incluidas">
                          <select
                            className={input}
                            value={current.filter}
                            onChange={(e) => update({ filter: e.target.value })}
                          >
                            <option value="all">Todas</option>
                            <option value="destination">
                              Mismo destino que la operación actual
                            </option>
                            <option value="channel">
                              Mismo canal que la operación actual
                            </option>
                          </select>
                        </Field>
                        <Field label="Cálculo">
                          <select
                            className={input}
                            value={current.operation}
                            onChange={(e) =>
                              update({
                                operation: e.target.value,
                                compare: false,
                              })
                            }
                          >
                            <option value="count">Contar eventos</option>
                            <option value="sum">Sumar importes</option>
                            <option value="median">Mediana de importes</option>
                            <option value="distinct">
                              Contar destinos distintos
                            </option>
                          </select>
                        </Field>
                        {["sum", "median"].includes(current.operation) && (
                          <label className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={current.compare}
                              onChange={(e) =>
                                update({ compare: e.target.checked })
                              }
                            />
                            Dividir importe actual entre el resultado histórico
                          </label>
                        )}
                        <p className="text-xs text-text-secondary">
                          Sin observaciones: conteos = 0; importes = ausente.
                          División entre cero = ausente. Los importes del
                          ejemplo están en una misma unidad monetaria.
                        </p>
                        {current.filter !== "all" && (
                          <p className="text-xs text-warning">
                            El mapeo entre el campo histórico y el actual debe
                            confirmarse antes de entrenar.
                          </p>
                        )}
                      </div>
                      <aside className="rounded-lg bg-primary/5 p-4 space-y-3">
                        <div className="text-xs font-semibold text-primary">
                          VISTA PREVIA FICTICIA
                        </div>
                        <p className="text-xs">
                          Caso actual: importe 120 · destino A · canal App
                        </p>
                        <div className="text-3xl font-semibold">
                          {calculated.value === null
                            ? "Ausente"
                            : Number(calculated.value.toFixed(3))}
                        </div>
                        <p className="text-xs">
                          {calculated.support} de {history.length} entradas
                          utilizadas
                        </p>
                        <div className="space-y-2">
                          {calculated.rows.map((r, i) => (
                            <div
                              key={i}
                              className="flex justify-between gap-2 text-xs border-b border-border pb-1"
                            >
                              <span>
                                {r.hours < 0
                                  ? "Dentro de 2 h"
                                  : r.hours === 0
                                    ? "Simultánea"
                                    : `Hace ${r.hours} h`}{" "}
                                · {r.amount ?? "sin importe"}
                              </span>
                              <span
                                className={
                                  r.reason === "Incluida"
                                    ? "text-success"
                                    : "text-text-secondary"
                                }
                              >
                                {r.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                      </aside>
                    </>
                  )}
                </div>
              </section>
              {!validFeatures && (
                <p role="alert" className="text-sm text-danger">
                  Revisa el JSON y las vistas previas. Usa nombres de variables
                  únicos con letras, números o guiones bajos. Incluye al menos
                  una característica y usa nombres únicos, no vacíos, para las
                  recetas.
                </p>
              )}
            </>
          )}
          {!result && step === 2 && (
            <section className={panel}>
              <div className="flex justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    Configuración de aprendizaje
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Valores iniciales tomados del modelo actual de ARIA.
                  </p>
                </div>
                <button
                  className={button}
                  onClick={() => {
                    setConfig({ ...defaults });
                    setWeight("auto");
                    setEarly(true);
                  }}
                >
                  Restablecer
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {params
                  .slice(0, advanced ? params.length : 3)
                  .map(([key, label, hint, min, max, increment]) => (
                    <Field key={key} label={label}>
                      <input
                        type="number"
                        className={input}
                        min={min}
                        max={max}
                        step={increment}
                        value={Number.isNaN(config[key]) ? "" : config[key]}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            [key]:
                              e.target.value === ""
                                ? NaN
                                : Number(e.target.value),
                          })
                        }
                      />
                      <span className="block text-xs font-normal text-text-secondary">
                        {hint} Rango: {min}–{max}.
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
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  >
                    <option value="auto">Automático según entrenamiento</option>
                    <option value="manual">Manual</option>
                  </select>
                </Field>
                {weight === "manual" && (
                  <Field label="Peso manual">
                    <input
                      type="number"
                      min="0.01"
                      step="0.1"
                      className={input}
                      value={manualWeight}
                      onChange={(e) => setManualWeight(Number(e.target.value))}
                    />
                  </Field>
                )}
              </div>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={early}
                  onChange={(e) => setEarly(e.target.checked)}
                />
                Parada temprana: detener tras 30 iteraciones sin mejorar log
                loss en validación
              </label>
              {!validParams && (
                <p role="alert" className="text-sm text-danger">
                  Revisa los rangos y los valores enteros de los parámetros.
                </p>
              )}
            </section>
          )}
          {!result && step === 3 && (
            <div className="grid md:grid-cols-2 gap-5">
              <section className={panel}>
                <h3 className="font-semibold">{name || "Modelo sin nombre"}</h3>
                <p className="text-sm">{description || "Sin descripción"}</p>
                <dl className="text-sm space-y-3">
                  <div>
                    <dt className="text-text-secondary">Objetivo</dt>
                    <dd>
                      marcacion_final · positivo: {positive || "Pendiente"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">Evaluación</dt>
                    <dd>
                      {split === "temporal"
                        ? "Separación temporal"
                        : "Separación aleatoria estratificada"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">Características</dt>
                    <dd>
                      {Object.values(fields).filter((v) => v !== "drop").length}{" "}
                      campos incluidos · {recipes.length} recetas históricas ·{" "}
                      {definitions.length} variables JSON
                    </dd>
                  </div>
                </dl>
                {recipes.map((r) => (
                  <p key={r.id} className="text-xs rounded bg-primary/5 p-2">
                    {r.name} · {windows.find(([v]) => v === r.hours)?.[1]} ·{" "}
                    {r.operation} · {r.filter}
                    {r.compare ? " · comparar importe actual" : ""}
                  </p>
                ))}
              </section>
              <section className={panel}>
                <h3 className="font-semibold">XGBoost y condiciones</h3>
                {Object.entries(config).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span>{k}</span>
                    <span>{String(v)}</span>
                  </div>
                ))}
                <p className="text-sm">
                  Peso positivo:{" "}
                  {weight === "auto" ? "Automático" : manualWeight} · Parada
                  temprana: {early ? "Sí" : "No"}
                </p>
                <p className="text-xs rounded bg-warning/10 p-3">
                  Pendiente para el entrenamiento real: confirmar zona horaria,
                  equivalencia de destinos/canales y unidad monetaria. Se
                  excluyen entradas posteriores y simultáneas.
                </p>
              </section>
              {(!validData || !validFeatures || !validParams) && (
                <p role="alert" className="text-danger text-sm">
                  Completa el objetivo y revisa las características y los
                  parámetros antes de continuar.
                </p>
              )}
            </div>
          )}
          {result && (
            <>
              <div className="rounded-lg bg-warning/10 p-3 text-sm">
                Simulación interactiva sobre 200 casos ficticios (40 positivos).
                No representa el desempeño del dataset ni depende de los
                hiperparámetros elegidos.
              </div>
              <div className="flex gap-2 flex-wrap">
                {["Desempeño", "Curvas", "Configuración"].map((t) => (
                  <button
                    key={t}
                    className={tab === t ? primary : button}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === "Desempeño" && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      ["ROC-AUC", rocAuc.toFixed(3)],
                      ["Average Precision", averagePrecision.toFixed(3)],
                      ["Brier score", brier.toFixed(3)],
                      ["Log loss", logLoss.toFixed(3)],
                      ["Precisión", `${(m.precision * 100).toFixed(1)}%`],
                      ["Recall de fraude", `${(m.recall * 100).toFixed(1)}%`],
                      ["F1 de fraude", m.f1.toFixed(3)],
                      ["Alertas", `${m.alerts} / 200`],
                    ].map(([k, v]) => (
                      <div className={panel} key={k}>
                        <p className="text-xs text-text-secondary">{k}</p>
                        <p className="text-2xl font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>
                  <section className={panel}>
                    <Field label={`Umbral de alerta · ${threshold.toFixed(2)}`}>
                      <input
                        className="w-full accent-primary"
                        type="range"
                        min="0.05"
                        max="0.95"
                        step="0.05"
                        value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value))}
                      />
                    </Field>
                    <p className="text-sm text-text-secondary">
                      Explora el balance entre fraudes detectados y falsos
                      positivos. El umbral real se elegiría en validación y se
                      evaluaría en prueba.
                    </p>
                  </section>
                  <section className={panel}>
                    <h3 className="font-semibold">
                      Matriz de confusión · conteos
                    </h3>
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr>
                          <th className="p-3">Resultado real</th>
                          <th>Genera alerta</th>
                          <th>Sin alerta</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-primary/5">
                          <th className="p-3">Fraude</th>
                          <td>{m.tp} detectados</td>
                          <td>{m.fn} no detectados</td>
                        </tr>
                        <tr>
                          <th className="p-3">Legítimo</th>
                          <td>{m.fp} falsos positivos</td>
                          <td>{m.tn} correctos</td>
                        </tr>
                      </tbody>
                    </table>
                  </section>
                </>
              )}
              {tab === "Curvas" && (
                <div className="grid md:grid-cols-2 gap-5">
                  <section className={panel}>
                    <h3 className="font-semibold">
                      Pérdida por iteración · ilustrativa
                    </h3>
                    <div
                      className="h-64"
                      role="img"
                      aria-label="Curva ficticia: la pérdida de entrenamiento y validación disminuye con las iteraciones"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={Array.from({ length: 10 }, (_, i) => ({
                            iteration: (i + 1) * 40,
                            train: 0.6 / (1 + i * 0.7),
                            validation: 0.62 / (1 + i * 0.5) + i * 0.008,
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="iteration" />
                          <YAxis />
                          <Tooltip />
                          <Line
                            dataKey="train"
                            name="Entrenamiento"
                            stroke="#1464a5"
                            dot={false}
                          />
                          <Line
                            dataKey="validation"
                            name="Validación"
                            stroke="#cf8b17"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                  <section className={panel}>
                    <h3 className="font-semibold">
                      Precisión y recall · casos ficticios
                    </h3>
                    <div
                      className="h-64"
                      role="img"
                      aria-label="Precisión y recall calculados a distintos umbrales sobre los 200 casos ficticios"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={Array.from({ length: 19 }, (_, i) => {
                            const threshold = (i + 1) * 0.05;
                            return { threshold, ...metrics(threshold) };
                          })}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="threshold" />
                          <YAxis domain={[0, 1]} />
                          <Tooltip />
                          <Line
                            dataKey="precision"
                            name="Precisión"
                            stroke="#1464a5"
                            dot={false}
                          />
                          <Line
                            dataKey="recall"
                            name="Recall"
                            stroke="#cf8b17"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                </div>
              )}
              {tab === "Configuración" && (
                <section className={panel}>
                  <h3 className="font-semibold">
                    Configuración de esta simulación
                  </h3>
                  <p className="text-sm">
                    {name} · {recipes.length} recetas históricas ·{" "}
                    {definitions.length} variables JSON · {config.n_estimators}{" "}
                    árboles máximos · profundidad {config.max_depth} · tasa{" "}
                    {config.learning_rate}
                  </p>
                  <p className="text-sm text-text-secondary">
                    Duración real, métricas de prueba, calibración e importancia
                    de características estarán disponibles al conectar el
                    entrenamiento. No se han calculado en este prototipo.
                  </p>
                  <button
                    className={button}
                    onClick={() => {
                      setResult(false);
                      setStep(3);
                    }}
                  >
                    Ver receta completa
                  </button>
                </section>
              )}
            </>
          )}
        </div>
        <footer className="border-t border-border px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-text-secondary" role="status">
            {saved
              ? "Borrador exportado a JSON."
              : result
                ? "Exploración de resultados simulados"
                : `Paso ${step + 1} de 4 · configuración conservada mientras la página siga abierta`}
          </div>
          <div className="flex gap-2">
            {result ? (
              <button
                className={button}
                onClick={() => {
                  setResult(false);
                  setStep(3);
                }}
              >
                <ArrowLeft className="inline h-4 w-4 mr-1" />
                Volver al diseño
              </button>
            ) : (
              <>
                {step > 0 && (
                  <button className={button} onClick={() => setStep(step - 1)}>
                    Anterior
                  </button>
                )}
                {step < 3 ? (
                  <button
                    className={primary}
                    disabled={
                      step === 0
                        ? !validData
                        : step === 1
                          ? !validFeatures
                          : !validParams
                    }
                    onClick={() => setStep(step + 1)}
                  >
                    Continuar <ArrowRight className="inline h-4 w-4 ml-1" />
                  </button>
                ) : (
                  <>
                    <button
                      className={button}
                      disabled={!validData || !validFeatures || !validParams}
                      onClick={download}
                    >
                      <Check className="inline h-4 w-4 mr-1" />
                      Exportar borrador
                    </button>
                    <button
                      className={primary}
                      disabled={!validData || !validFeatures || !validParams}
                      onClick={() => setResult(true)}
                    >
                      Simular entrenamiento
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
