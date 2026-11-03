import { useState, type ReactNode } from "react";
import { AlertTriangle, CalendarRange, Info } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ApiMaturation, ApiMetricsWarning } from "@/lib/api/metrics.functions";
import {
  customDayRange,
  MATURATION_META,
  presetRange,
  RANGE_PRESETS,
  warningSummary,
  warningText,
  type RangeState,
} from "@/lib/api/metricsMapping";

/* Building blocks shared by /dashboard, /monitor and /historico-fraude. */

export function RangeControl({
  value,
  onChange,
}: {
  value: RangeState;
  onChange: (v: RangeState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | undefined>(value.custom);
  const label =
    value.custom?.from && value.custom?.to
      ? `${format(value.custom.from, "d MMM", { locale: es })} – ${format(value.custom.to, "d MMM", { locale: es })}`
      : "Rango personalizado";
  return (
    <>
      <div className="inline-flex rounded-lg border border-border bg-surface p-1">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange({ preset: p, ...presetRange(p) })}
            className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
              value.preset === p
                ? "bg-primary text-primary-foreground"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={value.custom ? "default" : "outline"}
            size="sm"
            className="h-[30px] text-[11px] gap-1.5"
          >
            <CalendarRange className="h-3.5 w-3.5" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={pending}
            onSelect={setPending}
            defaultMonth={pending?.from}
            numberOfMonths={2}
            disabled={{ after: new Date() }}
            locale={es}
          />
          <div className="flex justify-end gap-2 p-3 border-t border-border">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!pending?.from || !pending?.to}
              onClick={() => {
                if (!pending?.from || !pending?.to) return;
                setOpen(false);
                onChange({
                  preset: null,
                  custom: pending,
                  ...customDayRange(pending.from, pending.to),
                });
              }}
            >
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

export function MaturationBadge({ maturation }: { maturation: ApiMaturation | null }) {
  if (!maturation) return null;
  const meta = MATURATION_META[maturation];
  return (
    <span
      title={meta.help}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

/** One-line scope note + the API's warnings, each a short sentence with the detail on demand. */
export function MetricsNotices({ warnings }: { warnings: ApiMetricsWarning[] }) {
  return (
    <div className="space-y-2 mb-6">
      <p className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-text-primary">
          Sólo medidas acumulativas sobre el periodo
        </span>
        <MoreDetail>
          Conteos, sumas y distribuciones del rango elegido (no fotos de un instante). Las tasas se
          calculan como numerador / denominador del periodo completo.
        </MoreDetail>
      </p>
      {warnings.length === 1 && <WarningLine warning={warnings[0]} />}
      {warnings.length > 1 && <WarningGroup warnings={warnings} />}
    </div>
  );
}

const WARNING_BOX =
  "rounded-lg border border-warning/30 bg-warning/10 px-3 py-1.5 flex flex-wrap items-center gap-2 text-[12px] text-text-primary";

function WarningLine({ warning }: { warning: ApiMetricsWarning }) {
  return (
    <div role="status" className={WARNING_BOX}>
      <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
      <span>{warningSummary(warning)}</span>
      <MoreDetail>
        {warningText(warning)}
        {warning.periods.length > 0 && <> Periodos: {warning.periods.join(", ")}.</>}
      </MoreDetail>
    </div>
  );
}

// Several warnings share one box: a count up front, the list on demand.
function WarningGroup({ warnings }: { warnings: ApiMetricsWarning[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div role="status" className={WARNING_BOX}>
      <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
      <span>{warnings.length} avisos sobre este rango</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-[11px] text-primary hover:underline shrink-0"
      >
        {open ? "Ver menos" : "Ver más"}
      </button>
      {open && (
        <ul className="basis-full list-disc pl-5 space-y-1 text-text-secondary">
          {warnings.map((w) => (
            <li key={w.code}>
              <span className="text-text-primary">{warningSummary(w)}</span> {warningText(w)}
              {w.periods.length > 0 && <> Periodos: {w.periods.join(", ")}.</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Ver más" toggle: keeps long explanations out of the way until asked for. */
function MoreDetail({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-[11px] text-primary hover:underline shrink-0"
      >
        {open ? "Ver menos" : "Ver más"}
      </button>
      {open && <span className="basis-full text-text-secondary">{children}</span>}
    </>
  );
}

export function LoadingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl bg-card/80 backdrop-blur-sm">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-[12px] text-text-secondary">{label}</span>
    </div>
  );
}

export function ErrorBox({ error, what }: { error: unknown; what: string }) {
  const text = String(error);
  const forbidden = text.includes("-> 403");
  return (
    <div className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-[13px] text-danger mb-6">
      {forbidden
        ? `Tu rol no tiene permiso para ver ${what}.`
        : `No se pudieron cargar ${what}: ${text}`}
    </div>
  );
}

export const CARD = "bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]";
