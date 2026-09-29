import { InfoHint } from "./Hint";

export function LegendStat({
  label,
  value,
  caption,
  hint,
  colorClass = "border-border text-text-primary",
}: {
  label: string;
  value: string | number;
  caption?: string;
  hint?: string;
  colorClass?: string;
}) {
  return (
    <div className={`border-l-[3px] pl-3 py-0.5 min-w-0 ${colorClass}`}>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
        <span className="truncate">{label}</span>
        {hint && <InfoHint content={hint} />}
      </p>
      <p className="text-[20px] font-bold tabular-nums leading-tight truncate">{value}</p>
      {caption && <p className="text-[11px] text-text-secondary tabular-nums">{caption}</p>}
    </div>
  );
}
