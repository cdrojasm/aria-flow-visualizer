import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Gauge } from "lucide-react";
import { getOperationalSettings } from "@/lib/api/operations.functions";

/* Permanent reminder that the traffic gate is open below 100 %: part of the
   alerts goes straight to analysts. Silent at 100 %, while the agent is off
   (the kill-switch already says so) and when the settings can't be read. */
export function TrafficGateBanner({ canConfigure }: { canConfigure: boolean }) {
  const { data } = useQuery({
    queryKey: ["operationalSettings"],
    queryFn: () => getOperationalSettings(),
    refetchInterval: 60_000,
    retry: false,
  });
  if (!data || !data.agentEnabled || data.agentTrafficPct >= 100) return null;
  const pct = data.agentTrafficPct.toLocaleString("es-CO", { maximumFractionDigits: 1 });
  return (
    <div
      role="status"
      data-testid="traffic-gate-banner"
      className="flex items-center gap-2.5 border-b border-primary/30 bg-primary/5 px-6 py-2"
    >
      <Gauge className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
      <p className="text-[13px] text-text-primary">
        ARIA recibe <span className="font-semibold">{pct} %</span> del tráfico; el resto se escala
        directo a analistas.
      </p>
      {canConfigure && (
        <Link
          to="/configuracion"
          className="ml-auto text-[12px] font-medium text-primary hover:underline"
        >
          Ver llave de paso
        </Link>
      )}
    </div>
  );
}
