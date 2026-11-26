import { useEffect, useState } from "react";
import { Gauge, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Slider } from "@/components/ui/slider";
import type { ChannelCapacity } from "@/lib/api/operations.functions";

/* "Llave de paso a producción": what share of simulator/production alerts
   ARIA processes. The rest escalates straight to an analyst. Moving the dial
   only *prepares* a value; nothing changes until the admin confirms in the
   announcement dialog. Alerts are routed by a hash of their id, so raising
   the share only ever adds alerts to ARIA. */

export const TRAFFIC_PRESETS = [0, 5, 10, 25, 50, 100] as const;

export function formatPct(value: number): string {
  return `${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
}

export function trafficGateWarnings(args: {
  pct: number;
  analystEnabled: boolean;
  analysts: ChannelCapacity | undefined;
}): string[] {
  const warnings: string[] = [];
  if (args.pct >= 100) return warnings;
  if (!args.analystEnabled) {
    warnings.push(
      "El estado del analista está apagado: las alertas que no van a ARIA se acumularían sin atención.",
    );
  } else if (args.analysts && args.analysts.status !== "available") {
    warnings.push(
      args.analysts.status === "exhausted"
        ? "No hay analistas libres en este momento: la cola puede crecer."
        : "Los analistas no están disponibles en este momento: la cola puede crecer.",
    );
  }
  if (args.pct === 0) {
    warnings.push("Con 0 % ARIA no procesa ninguna alerta de producción ni del simulador.");
  }
  return warnings;
}

export function TrafficGateDial({
  current,
  analystEnabled,
  analysts,
  readOnly,
  pending,
  error,
  onApply,
}: {
  current: number;
  analystEnabled: boolean;
  analysts: ChannelCapacity | undefined;
  readOnly?: boolean;
  pending?: boolean;
  error?: string | null;
  onApply: (pct: number) => Promise<unknown> | void;
}) {
  const [target, setTarget] = useState<number>(current);
  const [confirming, setConfirming] = useState(false);

  // Follow the server value when it changes (after applying or on reload).
  useEffect(() => setTarget(current), [current]);

  const changed = target !== current;
  const warnings = trafficGateWarnings({ pct: target, analystEnabled, analysts });

  return (
    <div className="p-6 space-y-5" data-testid="traffic-gate">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary">
            <Gauge className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-medium text-text-primary" data-testid="traffic-current">
              ARIA recibe {formatPct(current)} del tráfico
            </p>
            <p className="text-[12px] text-text-secondary">
              {current >= 100
                ? "Todas las alertas de producción y del simulador las procesa ARIA."
                : `El ${formatPct(100 - current)} restante se escala directo a un analista, sin pasar por ARIA.`}
            </p>
          </div>
        </div>
        <p className="text-[24px] font-semibold tabular-nums text-text-primary">
          {formatPct(target)}
        </p>
      </div>

      <Slider
        aria-label="Porcentaje de alertas hacia ARIA"
        min={0}
        max={100}
        step={1}
        value={[target]}
        disabled={readOnly || pending}
        onValueChange={([v]) => setTarget(v)}
      />

      <div className="flex flex-wrap items-center gap-2">
        {TRAFFIC_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={readOnly || pending}
            onClick={() => setTarget(preset)}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium disabled:opacity-50 ${target === preset ? "border-primary bg-primary/10 text-primary" : "border-border text-text-primary hover:bg-background"}`}
          >
            {preset} %
          </button>
        ))}
      </div>

      {warnings.map((warning) => (
        <p key={warning} className="text-[12px] text-warning" role="status">
          {warning}
        </p>
      ))}
      {error && <p className="text-[12px] text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={!changed || pending}
          onClick={() => setTarget(current)}
          className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text-primary hover:bg-background disabled:opacity-50"
        >
          Descartar
        </button>
        <button
          type="button"
          disabled={!changed || readOnly || pending}
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          Aplicar porcentaje…
        </button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cambiar el tráfico hacia ARIA: {formatPct(current)} → {formatPct(target)}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-[13px]">
                <p>
                  Se aplica de inmediato a toda la operación, también a las alertas que ya están en
                  cola y aún no empezaron. El {formatPct(100 - target)} de las alertas de producción
                  y del simulador irá directo a los analistas.
                </p>
                {target > current ? (
                  <p>Las alertas que ARIA ya tenía asignadas se mantienen con ARIA.</p>
                ) : (
                  <p>Algunas alertas que hoy irían a ARIA pasarán a los analistas.</p>
                )}
                {warnings.map((warning) => (
                  <p key={warning} className="text-warning">
                    {warning}
                  </p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void Promise.resolve(onApply(target))
                  .then(() => setConfirming(false))
                  .catch(() => setConfirming(false));
              }}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar y aplicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
