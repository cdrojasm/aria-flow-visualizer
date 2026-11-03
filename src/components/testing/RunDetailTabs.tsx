import { useState, type ReactNode } from "react";

import { InfoHint } from "./Hint";
import { TOP_EDGE_LINE } from "./surfaceStyles";

export type RunDetailTab = {
  key: string;
  label: string;
  headerStat?: { label: string; value: string; hint?: string; caption?: string };
  content: ReactNode;
};

export function RunDetailTabs({ tabs }: { tabs: RunDetailTab[] }) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];

  return (
    <section className={`bg-card ${TOP_EDGE_LINE}`}>
      <div className="flex items-end justify-between gap-4 flex-wrap border-b border-border mb-6">
        <div role="tablist" className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`run-tab-${tab.key}`}
              aria-selected={tab.key === active?.key}
              aria-controls={`run-panel-${tab.key}`}
              onClick={() => setActiveKey(tab.key)}
              className={`pt-3 pb-2.5 -mb-px border-b-2 text-[15px] font-semibold transition-colors ${tab.key === active?.key ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {active?.headerStat && (
          <div className="text-right pb-1">
            <p className="flex items-center justify-end gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {active.headerStat.label}
              {active.headerStat.hint && <InfoHint content={active.headerStat.hint} />}
            </p>
            <p className="text-[14px] font-bold tabular-nums text-primary">
              {active.headerStat.value}
            </p>
            {active.headerStat.caption && (
              <p className="text-[11px] text-text-secondary tabular-nums">
                {active.headerStat.caption}
              </p>
            )}
          </div>
        )}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`run-panel-${tab.key}`}
          aria-labelledby={`run-tab-${tab.key}`}
          hidden={tab.key !== active?.key}
        >
          {tab.content}
        </div>
      ))}
    </section>
  );
}
