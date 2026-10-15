import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { scoreModel, type ModelResponse } from "@/lib/api/models.functions";

type ContractField = { path: string; kind: "number" | "json" | "text" };
const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] focus:border-primary focus:outline-none";

function collectRecipePaths(value: unknown, paths = new Set<string>()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRecipePaths(item, paths));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (["path", "current_path"].includes(key) && typeof child === "string") {
        const path = child.trim();
        if (path && path !== "$" && !path.startsWith("$")) paths.add(path);
      }
      collectRecipePaths(child, paths);
    }
  }
  return paths;
}

function modelContract(model: ModelResponse): ContractField[] {
  const fields = new Map<string, ContractField>();
  const add = (path: string | null | undefined, kind: ContractField["kind"]) => {
    if (!path || !path.trim() || path === model.target_field) return;
    const existing = fields.get(path);
    if (!existing || (existing.kind === "text" && kind !== "text"))
      fields.set(path, { path, kind });
  };
  for (const transform of model.feature_transforms ?? []) {
    if (transform.kind === "drop") continue;
    add(transform.field, transform.kind === "numeric" ? "number" : "text");
    add(transform.reference_field, "text");
  }
  for (const feature of model.historical_features ?? []) {
    add(feature.field, "json");
    add(feature.reference_field, "text");
  }
  const configuration = model.feature_configuration;
  if (configuration) {
    for (const recipe of configuration.recipes ?? [])
      collectRecipePaths(recipe).forEach((path) => add(path, "text"));
    for (const path of [
      configuration.mappings?.history,
      configuration.mappings?.history_time,
      configuration.mappings?.entity,
      configuration.mappings?.history_entity,
      configuration.mappings?.reference_time,
    ])
      add(path, path === configuration.mappings?.history ? "json" : "text");
  }
  return [...fields.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function parseField(raw: string, field: ContractField): unknown {
  if (field.kind === "json") return raw.trim() ? JSON.parse(raw) : [];
  if (field.kind === "number") return raw.trim() ? Number(raw) : null;
  return raw;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".").filter(Boolean);
  if (parts.length < 2) {
    target[path] = value;
    return;
  }
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts.at(-1)!] = value;
}

export function ModelContractTester({ model }: { model: ModelResponse }) {
  const fields = useMemo(() => modelContract(model), [model]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState("");
  const score = useMutation({
    mutationFn: (row: Record<string, unknown>) => scoreModel({ data: { id: model.id, row } }),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParseError("");
    score.reset();
    try {
      const row: Record<string, unknown> = {};
      for (const field of fields)
        setPath(row, field.path, parseField(values[field.path] ?? "", field));
      score.mutate(row);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Revisa los valores del contrato.");
    }
  }

  if (model.status !== "READY")
    return (
      <p className="rounded-md bg-warning/10 p-4 text-sm">
        Entrena el modelo para probar el contrato de scoring.
      </p>
    );
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h3 className="font-semibold">Prueba del contrato del modelo</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Los campos se generan desde la versión guardada con este modelo. El API aplica la misma
            receta y el mismo artefacto del entrenamiento.
          </p>
        </div>
        {fields.length === 0 ? (
          <p className="text-sm text-danger">
            Este modelo no tiene campos de entrada configurados.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field.path} className="space-y-1 text-xs font-medium text-text-secondary">
                <span>
                  {field.path}
                  {field.kind === "json" ? " · JSON" : ""}
                </span>
                {field.kind === "json" ? (
                  <textarea
                    aria-label={field.path}
                    className={`${inputClass} min-h-24 font-mono`}
                    placeholder="[]"
                    value={values[field.path] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.path]: event.target.value }))
                    }
                  />
                ) : (
                  <input
                    aria-label={field.path}
                    className={inputClass}
                    type={field.kind === "number" ? "number" : "text"}
                    step="any"
                    value={values[field.path] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.path]: event.target.value }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
        )}
        {(parseError || score.error) && (
          <p role="alert" className="text-sm text-danger">
            {parseError ||
              (score.error instanceof Error
                ? score.error.message
                : "No se pudo puntuar el registro.")}
          </p>
        )}
        <button
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!fields.length || score.isPending}
        >
          {score.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}{" "}
          Puntuar registro
        </button>
      </form>
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Resultado</h3>
        {!score.data && !score.isPending && (
          <p className="mt-2 text-sm text-text-secondary">
            Completa los campos y ejecuta una prueba para ver el resultado.
          </p>
        )}
        {score.isPending && (
          <p className="mt-2 text-sm text-text-secondary">
            El servicio de scoring está evaluando el registro…
          </p>
        )}
        {score.data && (
          <div className="mt-4 space-y-3">
            <div className="text-3xl font-semibold text-primary">
              {(score.data.score * 100).toFixed(2)}%
            </div>
            <p className="text-sm">
              {score.data.predicted_positive
                ? "Clasificado como positivo"
                : "Clasificado como negativo"}{" "}
              · umbral {(score.data.threshold * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-text-secondary">
              Score calibrado · bruto {score.data.score_raw.toFixed(4)} · {score.data.model_tag}
            </p>
            {score.data.top_features.length > 0 && (
              <div className="border-t border-border pt-3">
                <h4 className="mb-2 text-xs font-semibold">Principales contribuciones</h4>
                <ul className="space-y-2">
                  {score.data.top_features.map((item) => (
                    <li key={item.feature} className="flex justify-between gap-3 text-xs">
                      <span className="truncate">
                        {item.feature} <span className="text-text-secondary">{item.value}</span>
                      </span>
                      <span className="shrink-0">
                        {item.contribution > 0 ? "+" : ""}
                        {item.contribution.toFixed(4)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
