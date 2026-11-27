import type { GenerationCandidate } from "./generation";

const TRANSFORM_TEXT: Record<GenerationCandidate["transform"], string> = {
  pass: "se usa directo",
  categorize: "categoría (texto)",
  datetime_parts: "hora y día de la semana",
  count: "conteo de la lista",
};

const TYPE_LABELS: Record<string, string> = {
  string: "texto",
  number: "número",
  bool: "booleano",
  date: "fecha",
  datetime: "fecha y hora",
  list: "lista",
};

const btn =
  "rounded-md border border-border px-3 py-2 text-[12px] hover:bg-primary/5 disabled:opacity-40";

function Row({
  item,
  checked,
  onToggle,
}: {
  item: GenerationCandidate;
  checked: boolean;
  onToggle: (path: string) => void;
}) {
  const locked = item.level === "exclude";
  const suspect = item.level === "suspect";
  return (
    <li
      data-testid={`fe-gen-item-${item.path}`}
      data-level={item.level}
      data-checked={checked ? "true" : "false"}
      className="flex flex-wrap items-start gap-2 rounded border border-border bg-card px-2 py-1.5 text-[12px]"
    >
      <input
        type="checkbox"
        className="mt-0.5"
        aria-label={`Incluir ${item.label}`}
        data-testid={`fe-gen-check-${item.path}`}
        checked={checked}
        disabled={locked || (suspect && !checked)}
        onChange={() => onToggle(item.path)}
      />
      <div className="min-w-0 flex-1">
        <p className="break-all">
          <span className="font-medium">{item.label}</span>
          <span className="text-text-secondary">
            {item.type ? ` · ${TYPE_LABELS[item.type] ?? item.type}` : ""}
            {item.level === "ok" || item.level === "warn"
              ? ` · ${TRANSFORM_TEXT[item.transform]}`
              : ""}
            {item.inSchema ? "" : " · fuera del esquema"}
          </span>
        </p>
        {item.guard && (
          <p
            data-testid={`fe-gen-reason-${item.path}`}
            className={
              locked ? "text-danger" : item.level === "warn" ? "text-warning" : "text-warning"
            }
          >
            {item.level === "warn" ? `Aviso: ${item.guard.reason}` : item.guard.reason}
          </p>
        )}
      </div>
      {locked && (
        <span data-testid={`fe-gen-locked-${item.path}`} className="text-[11px] text-danger">
          No se puede usar
        </span>
      )}
      {suspect && (
        <button
          type="button"
          className={btn}
          aria-pressed={checked}
          data-testid={`fe-gen-force-${item.path}`}
          onClick={() => onToggle(item.path)}
        >
          {checked ? "No incluir" : "Incluir de todos modos"}
        </button>
      )}
    </li>
  );
}

/**
 * Review of the proposed variables. Fields that pass the rules arrive marked;
 * suspects (identifier / after the decision, by name) arrive unmarked with their
 * reason and can be included explicitly; hard exclusions cannot be marked.
 */
export function GenerationReview({
  candidates,
  included,
  onToggle,
  createCount,
  existingCount,
  max,
  onConfirm,
  onCancel,
}: {
  candidates: GenerationCandidate[];
  included: Set<string>;
  onToggle: (path: string) => void;
  createCount: number;
  existingCount: number;
  max: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const proposed = candidates.filter((c) => c.level === "ok" || c.level === "warn");
  const suspects = candidates.filter((c) => c.level === "suspect");
  const excluded = candidates.filter((c) => c.level === "exclude");
  const exceeds = existingCount + createCount > max;
  const section = (id: string, title: string, help: string, items: GenerationCandidate[]) =>
    items.length > 0 && (
      <div data-testid={`fe-gen-section-${id}`} className="space-y-1">
        <p className="text-[12px] font-semibold">
          {title} ({items.length})
        </p>
        <p className="text-[11px] text-text-secondary">{help}</p>
        <ul className="space-y-1">
          {items.map((item) => (
            <Row
              key={item.path}
              item={item}
              checked={included.has(item.path)}
              onToggle={onToggle}
            />
          ))}
        </ul>
      </div>
    );
  return (
    <div
      data-testid="fe-generate-review"
      role="region"
      aria-label="Revisión de variables propuestas"
      className="space-y-3 rounded-lg border border-primary/40 bg-surface p-3"
    >
      <div>
        <p className="text-[13px] font-semibold">Revisa las variables propuestas</p>
        <p className="text-[11px] text-text-secondary">
          Se proponen los campos que pasan las reglas. Los que parecen identificadores o se generan
          después de decidir quedan sin marcar; las etiquetas, el resultado de ARIA y lo marcado en
          el esquema no se pueden usar.
        </p>
      </div>
      <div className="max-h-[22rem] space-y-3 overflow-y-auto pr-1">
        {section(
          "ok",
          "Se proponen",
          "Marcadas por defecto. Los datos sensibles llevan un aviso.",
          proposed,
        )}
        {section(
          "suspect",
          "Sospechosas",
          "Sin marcar: pueden memorizar o filtrar la respuesta. Inclúyelas solo si estás seguro.",
          suspects,
        )}
        {section(
          "exclude",
          "No se pueden usar",
          "Reglas duras del esquema: no se pueden marcar.",
          excluded,
        )}
      </div>
      {exceeds && (
        <p role="alert" data-testid="fe-gen-limit" className="text-sm text-danger">
          Crear estas variables superaría el límite de {max} variables. Desmarca algunas.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${btn} bg-primary text-white`}
          data-testid="fe-gen-confirm"
          disabled={createCount === 0 || exceeds}
          onClick={onConfirm}
        >
          Crear {createCount} {createCount === 1 ? "variable" : "variables"}
        </button>
        <button type="button" className={btn} data-testid="fe-gen-cancel" onClick={onCancel}>
          Cancelar
        </button>
        <span data-testid="fe-gen-summary" className="text-[11px] text-text-secondary">
          {[...proposed, ...suspects].filter((c) => included.has(c.path)).length} de{" "}
          {proposed.length + suspects.length} campos marcados
        </span>
      </div>
    </div>
  );
}
