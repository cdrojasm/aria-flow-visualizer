import { useState } from "react";
import { Plus, Trash2, Braces } from "lucide-react";

export type FeatureDefinition = {
  id: string;
  name: string;
  source: string;
  operation: string;
  field: string;
  threshold: number;
  below: string;
  above: string;
};
export const sampleTransaction = JSON.stringify(
  {
    transaction: {
      amount: 120,
      channel: "App",
      timestamp: "2026-09-07T12:00:00Z",
      items: [{ amount: 40 }, { amount: 80 }],
    },
    history: [
      { amount: 40, channel: "App", timestamp: "2026-09-07T11:00:00Z" },
      { amount: 80, channel: "Web", timestamp: "2026-09-06T18:00:00Z" },
      { amount: 100, channel: "App", timestamp: "2026-09-05T12:00:00Z" },
    ],
  },
  null,
  2,
);
export const initialDefinitions: FeatureDefinition[] = [
  {
    id: "amount",
    name: "importe_actual",
    source: "transaction.amount",
    operation: "map",
    field: "amount",
    threshold: 100,
    below: "Bajo",
    above: "Alto",
  },
  {
    id: "history",
    name: "importe_promedio_historico",
    source: "history",
    operation: "mean",
    field: "amount",
    threshold: 100,
    below: "Bajo",
    above: "Alto",
  },
];
const control =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const operations = [
  ["map", "Mapear variable"],
  ["log", "Logaritmo · log(1 + x)"],
  ["abs", "Valor absoluto"],
  ["category", "Categorizar por umbral"],
  ["count", "Array · contar"],
  ["sum", "Array · sumar"],
  ["mean", "Array · promedio"],
  ["min", "Array · mínimo"],
  ["max", "Array · máximo"],
  ["distinct", "Array · valores únicos"],
];
function readPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, key) => {
      if (
        !current ||
        typeof current !== "object" ||
        !Object.hasOwn(current, key)
      )
        return undefined;
      return (current as Record<string, unknown>)[key];
    }, value);
}
export function evaluateFeature(
  definition: FeatureDefinition,
  data: unknown,
  hours: number,
) {
  const source = readPath(data, definition.source);
  if (source === undefined || source === null)
    throw new Error("Ruta ausente o valor nulo.");
  const numeric = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error("Se requiere un número válido.");
    return value;
  };
  if (definition.operation === "map") return { value: source, support: null };
  if (["log", "abs", "category"].includes(definition.operation)) {
    const value = numeric(source);
    if (definition.operation === "log" && value <= -1)
      throw new Error("log(1 + x) requiere x > -1.");
    return {
      value:
        definition.operation === "log"
          ? Math.log1p(value)
          : definition.operation === "abs"
            ? Math.abs(value)
            : value < definition.threshold
              ? definition.below
              : definition.above,
      support: null,
    };
  }
  if (!Array.isArray(source))
    throw new Error("La ruta debe apuntar a un array.");
  let rows = source;
  if (definition.source === "history") {
    const timestamp = readPath(data, "transaction.timestamp");
    const current = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
    if (!Number.isFinite(current))
      throw new Error(
        "Falta transaction.timestamp válido para el corte histórico.",
      );
    rows = rows.filter((row) => {
      const timestamp = readPath(row, "timestamp");
      const time = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
      return (
        Number.isFinite(time) &&
        time < current &&
        current - time <= hours * 3600000
      );
    });
  }
  if (definition.operation === "count")
    return { value: rows.length, support: rows.length };
  const values = rows
    .map((row) => readPath(row, definition.field))
    .filter((v) => v !== undefined && v !== null);
  if (definition.operation === "distinct")
    return {
      value: new Set(values.map((v) => JSON.stringify(v))).size,
      support: values.length,
    };
  const numbers = values.map(numeric);
  if (!numbers.length) return { value: null, support: 0 };
  const sum = numbers.reduce((a, b) => a + b, 0);
  const value =
    definition.operation === "sum"
      ? sum
      : definition.operation === "mean"
        ? sum / numbers.length
        : definition.operation === "min"
          ? numbers.reduce((a, b) => Math.min(a, b))
          : numbers.reduce((a, b) => Math.max(a, b));
  if (!Number.isFinite(value))
    throw new Error("Resultado fuera del rango numérico.");
  return { value, support: numbers.length };
}
export function FeatureEngineering({
  definitions,
  onChange,
  json,
  onJsonChange,
  hours,
  onHoursChange,
}: {
  definitions: FeatureDefinition[];
  onChange: (value: FeatureDefinition[]) => void;
  json: string;
  onJsonChange: (value: string) => void;
  hours: number;
  onHoursChange: (value: number) => void;
}) {
  const [selected, setSelected] = useState(definitions[0]?.id ?? "");
  const active = definitions.find((d) => d.id === selected);
  let data: unknown;
  let error = "";
  try {
    data = JSON.parse(json);
    if (!data || typeof data !== "object" || Array.isArray(data))
      error = "El JSON debe ser un objeto con transaction e history.";
  } catch {
    error = "JSON inválido. Revisa comas, comillas y llaves.";
  }
  const update = (patch: Partial<FeatureDefinition>) =>
    onChange(
      definitions.map((d) => (d.id === selected ? { ...d, ...patch } : d)),
    );
  const result = (definition: FeatureDefinition) => {
    try {
      if (error) throw new Error(error);
      return { ...evaluateFeature(definition, data, hours), error: "" };
    } catch (e) {
      return { value: null, support: null, error: (e as Error).message };
    }
  };
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Braces size={18} className="text-primary" /> Ingeniería de
            características
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            Del JSON a las variables del modelo. Configura y prueba cada
            cálculo.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs">
          {definitions.length} variables · muestra editable
        </span>
      </div>
      <div className="grid lg:grid-cols-[220px_1fr]">
        <aside className="p-4 space-y-2 border-b lg:border-b-0 lg:border-r border-border">
          {definitions.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d.id)}
              className={`w-full rounded-md border p-3 text-left text-sm ${selected === d.id ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <span className="block truncate font-medium">
                {d.name || "Sin nombre"}
              </span>
              <span className="text-xs text-text-secondary">
                {operations.find(([key]) => key === d.operation)?.[1]}
              </span>
            </button>
          ))}
          <button
            className="flex items-center gap-2 text-sm text-primary p-2"
            onClick={() => {
              const id = crypto.randomUUID();
              let index = definitions.length + 1;
              while (definitions.some((d) => d.name === `variable_${index}`))
                index++;
              onChange([
                ...definitions,
                { ...initialDefinitions[0], id, name: `variable_${index}` },
              ]);
              setSelected(id);
            }}
          >
            <Plus size={16} /> Añadir variable
          </button>
        </aside>
        <div className="p-4 space-y-4">
          {active ? (
            <>
              <div className="flex justify-between items-center">
                <h4 className="font-medium">Configurar variable</h4>
                <button
                  aria-label={`Eliminar ${active.name}`}
                  className="p-2 text-text-secondary hover:text-danger"
                  onClick={() => {
                    onChange(definitions.filter((d) => d.id !== active.id));
                    setSelected(
                      definitions.find((d) => d.id !== active.id)?.id ?? "",
                    );
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">
                  Nombre de salida
                  <input
                    className={control}
                    value={active.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  Ruta de origen
                  <input
                    className={control}
                    value={active.source}
                    onChange={(e) => update({ source: e.target.value })}
                    placeholder="transaction.amount o history"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  Operación
                  <select
                    className={control}
                    value={active.operation}
                    onChange={(e) => update({ operation: e.target.value })}
                  >
                    {operations.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {["sum", "mean", "min", "max", "distinct"].includes(
                  active.operation,
                ) && (
                  <label className="space-y-1 text-sm">
                    Campo de cada elemento
                    <input
                      className={control}
                      value={active.field}
                      onChange={(e) => update({ field: e.target.value })}
                      placeholder="amount"
                    />
                  </label>
                )}
                {active.operation === "category" && (
                  <>
                    <label className="space-y-1 text-sm">
                      Umbral
                      <input
                        type="number"
                        className={control}
                        value={active.threshold}
                        onChange={(e) =>
                          update({ threshold: e.target.valueAsNumber })
                        }
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      Categoría menor al umbral
                      <input
                        className={control}
                        value={active.below}
                        onChange={(e) => update({ below: e.target.value })}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      Categoría igual o mayor
                      <input
                        className={control}
                        value={active.above}
                        onChange={(e) => update({ above: e.target.value })}
                      />
                    </label>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-text-secondary">
              Añade una variable para mapear o transformar tu información.
            </p>
          )}
          <div className="rounded-lg bg-primary/5 p-3 text-xs text-text-secondary">
            Rutas separadas por puntos; por ejemplo transaction.amount,
            transaction.items o history. Los arrays históricos usan timestamp y
            solo incluyen eventos anteriores a la transacción actual. Los
            valores nulos se omiten; un agregado sin valores devuelve ausente.
          </div>
        </div>
      </div>
      <div className="border-t border-border p-4 grid lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="feature-json" className="text-sm font-medium">
            Transacción e historial · JSON de prueba ficticio
          </label>
          <textarea
            id="feature-json"
            spellCheck={false}
            className={`${control} h-64 font-mono text-xs`}
            value={json}
            onChange={(e) => onJsonChange(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="space-y-3">
          <label className="block text-sm space-y-1">
            Ventana para history
            <select
              className={control}
              value={hours}
              onChange={(e) => onHoursChange(Number(e.target.value))}
            >
              <option value={24}>24 horas</option>
              <option value={168}>7 días</option>
              <option value={720}>30 días</option>
            </select>
          </label>
          <h4 className="text-sm font-medium">Vista previa en vivo</h4>
          <div className="space-y-2" aria-live="polite">
            {definitions.map((d) => {
              const calculated = result(d);
              return (
                <div
                  key={d.id}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <div className="flex justify-between gap-3">
                    <span className="font-medium break-all">
                      {d.name || "Sin nombre"}
                    </span>
                    <code className="text-primary break-all">
                      {calculated.error
                        ? "Revisar"
                        : (JSON.stringify(calculated.value) ?? "Ausente")}
                    </code>
                  </div>
                  {calculated.error ? (
                    <p className="text-xs text-danger mt-1">
                      {calculated.error}
                    </p>
                  ) : (
                    calculated.support !== null && (
                      <p className="text-xs text-text-secondary mt-1">
                        {calculated.support} elementos utilizados
                      </p>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
export function validDefinitions(
  definitions: FeatureDefinition[],
  json: string,
  hours: number,
) {
  try {
    const data = JSON.parse(json);
    return (
      new Set(definitions.map((d) => d.name.trim())).size ===
        definitions.length &&
      definitions.every((d) => {
        if (
          !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(d.name) ||
          !d.source.trim() ||
          (d.operation === "category" &&
            (!Number.isFinite(d.threshold) ||
              !d.below.trim() ||
              !d.above.trim()))
        )
          return false;
        evaluateFeature(d, data, hours);
        return true;
      })
    );
  } catch {
    return false;
  }
}
