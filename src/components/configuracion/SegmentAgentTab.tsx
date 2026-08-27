import { useState } from "react";

import { SEGMENT_LABELS, type SegmentCode, type SegmentSettings } from "@/data/configs";
import { SegmentAgentSection } from "./SegmentAgentSection";

const SEGMENT_CODES: SegmentCode[] = ["canales_digitales", "tarjetas"];

/* ─── "Agente" tab ───────────────────────────────────────
   Own independent segment picker (not shared with Muestreo/Evaluación -
   see SegmentSamplingTab.tsx/SegmentEvaluationTab.tsx, split out of what
   used to be one combined "Config. por segmento" tab). */

export function SegmentAgentTab({
  value,
  onChange,
  disabled,
}: {
  value: Record<SegmentCode, SegmentSettings>;
  onChange: (code: SegmentCode, patch: Partial<SegmentSettings>) => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<SegmentCode>("canales_digitales");
  const segment = value[selected];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 bg-card rounded-xl border border-border p-1.5 w-fit">
        {SEGMENT_CODES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setSelected(code)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
              selected === code ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {SEGMENT_LABELS[code]}
          </button>
        ))}
      </div>

      <SegmentAgentSection
        value={segment.agent}
        onChange={(patch) => onChange(selected, { agent: { ...segment.agent, ...patch } })}
        disabled={disabled}
      />
    </div>
  );
}
