function JsonPrimitive({ value }: { value: string | number | boolean }) {
  if (typeof value === "string") return <span className="text-primary">&quot;{value}&quot;</span>;
  return <span className="text-warning">{String(value)}</span>;
}

// Solo los primeros niveles inician abiertos para no expandir historiales grandes.
export function JsonTree({
  value,
  label,
  depth = 0,
}: {
  value: unknown;
  label?: string;
  depth?: number;
}) {
  const keyPrefix = label !== undefined && <span className="text-text-secondary">{label}: </span>;
  const line = "text-[11px] font-mono leading-relaxed";

  if (value === null || value === undefined) {
    return (
      <div className={line}>
        {keyPrefix}
        <span className="text-text-secondary italic">null</span>
      </div>
    );
  }

  if (Array.isArray(value) || typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((item, index) => [String(index), item] as const)
      : Object.entries(value as Record<string, unknown>);
    const summary = Array.isArray(value) ? `Lista (${entries.length})` : `{${entries.length}}`;
    if (entries.length === 0) {
      return (
        <div className={line}>
          {keyPrefix}
          <span className="text-text-secondary">{Array.isArray(value) ? "[]" : "{}"}</span>
        </div>
      );
    }
    return (
      <details open={depth < (Array.isArray(value) ? 1 : 2)} className={line}>
        <summary className="cursor-pointer hover:text-text-primary">
          {keyPrefix}
          <span className="text-text-secondary">{summary}</span>
        </summary>
        <div className="ml-3 border-l border-border pl-2 mt-0.5 space-y-0.5">
          {entries.map(([key, item]) => (
            <JsonTree key={key} value={item} label={key} depth={depth + 1} />
          ))}
        </div>
      </details>
    );
  }

  return (
    <div className={line}>
      {keyPrefix}
      {typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? (
        <JsonPrimitive value={value} />
      ) : (
        <span className="text-text-secondary">{String(value)}</span>
      )}
    </div>
  );
}
