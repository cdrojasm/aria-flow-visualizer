import { ALL_OUTCOMES, type CaseOutcomeGroup } from "./caseStatus";
import { Hint, InfoHint } from "./Hint";

function formatPercent(value: number, total: number): string {
  const percent = total > 0 ? (value / total) * 100 : 0;
  return `${percent.toFixed(percent > 0 && percent < 10 ? 1 : 0)}%`;
}

export type InfoStat = {
  label: string;
  value: string | number;
  caption?: string;
  captionHint?: string;
  hint?: string;
};

export function CaseStatusFilters({
  groups,
  total,
  selected,
  onSelect,
  infoStats,
}: {
  groups: CaseOutcomeGroup[];
  total: number;
  selected: string;
  onSelect: (key: string) => void;
  infoStats: InfoStat[];
}) {
  const toggle = (key: string) => onSelect(selected === key ? ALL_OUTCOMES : key);
  const legend = [
    {
      key: ALL_OUTCOMES,
      label: "Todos los casos",
      count: total,
      legendClass: "border-l-border text-text-primary",
    },
    ...groups,
  ];

  return (
    <>
      <div
        role="group"
        aria-label="Grupos de casos"
        className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4"
      >
        {legend.map((item) => {
          const active = selected === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() =>
                item.key === ALL_OUTCOMES ? onSelect(ALL_OUTCOMES) : toggle(item.key)
              }
              className={`min-w-0 flex flex-col justify-start text-left border-l-[3px] rounded-r-md pl-3 pr-2 py-0.5 transition-colors ${item.legendClass} ${active ? "bg-primary-light" : "hover:bg-surface"}`}
            >
              <Hint content={item.label}>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-text-secondary truncate">
                  {item.label}
                </span>
              </Hint>
              <span className="block text-[20px] font-bold tabular-nums leading-tight">
                {item.count}
              </span>
              <span className="block text-[11px] text-text-secondary tabular-nums">
                {formatPercent(item.count, total)} del total
              </span>
            </button>
          );
        })}
        {infoStats.map((stat) => (
          <div key={stat.label} className="min-w-0 border-l-[3px] border-l-border pl-3 pr-2 py-0.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
              <span className="truncate">{stat.label}</span>
              {stat.hint && <InfoHint content={stat.hint} />}
            </span>
            <span className="block text-[20px] font-bold tabular-nums leading-tight text-text-primary truncate">
              {stat.value}
            </span>
            {stat.caption && (
              <span className="flex items-center gap-1 text-[11px] text-text-secondary">
                {stat.caption}
                {stat.captionHint && <InfoHint content={stat.captionHint} />}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
