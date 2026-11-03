import {
  ArrowRight,
  FilePenLine,
  GitBranch,
  HelpCircle,
  Rocket,
  Save,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function FlowStep({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-2.5 text-left">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-primary">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">{detail}</p>
    </div>
  );
}

function FlowArrow() {
  return <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-secondary" />;
}

export function ConfigurationVersionGuide() {
  return (
    <div className="mt-1.5 text-[11px]">
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="Ver ciclo de creación de versiones"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Ver ciclo de versionado
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="start"
            sideOffset={8}
            className="w-[min(680px,calc(100vw-32px))] border border-border bg-card p-4 text-text-primary shadow-xl"
          >
            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-semibold">Cómo se gestionan las configuraciones</p>
                <p className="mt-0.5 text-[10px] font-normal text-text-secondary">
                  Una configuración conserva su identidad; cada guardado registra la evolución de su contenido.
                </p>
              </div>

              <div className="flex items-stretch gap-1.5">
                <FlowStep
                  icon={<GitBranch className="h-3.5 w-3.5" />}
                  title="Configuración"
                  detail="Nueva o existente"
                />
                <FlowArrow />
                <FlowStep
                  icon={<FilePenLine className="h-3.5 w-3.5" />}
                  title="Borrador"
                  detail="Editable y basado en una versión"
                />
                <FlowArrow />
                <FlowStep
                  icon={<Save className="h-3.5 w-3.5" />}
                  title="Guardar"
                  detail="Crea v1 o registra el siguiente cambio"
                />
                <FlowArrow />
                <FlowStep
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  title="Probar"
                  detail="Valida antes de producción"
                />
                <FlowArrow />
                <FlowStep
                  icon={<Rocket className="h-3.5 w-3.5" />}
                  title="Desplegar"
                  detail="La versión queda protegida"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-[10px] font-normal">
                <div className="rounded-md bg-warning/10 px-3 py-2">
                  <p className="font-semibold text-text-primary">vN nunca desplegada</p>
                  <p className="mt-0.5 text-text-secondary">
                    “Guardar cambios” puede sobrescribir vN. “Guardar como nueva versión” conserva vN y crea vN+1.
                  </p>
                </div>
                <div className="rounded-md bg-success/10 px-3 py-2">
                  <p className="font-semibold text-text-primary">vN desplegada alguna vez</p>
                  <p className="mt-0.5 text-text-secondary">
                    Se conserva como historial inmutable; guardar el borrador crea automáticamente vN+1.
                  </p>
                </div>
              </div>

              <div className="rounded-md border border-border/70 bg-surface/70 px-3 py-2 text-[10px] font-normal leading-relaxed text-text-secondary">
                <p>
                  <span className="font-semibold text-text-primary">Nota · Configuración:</span>{" "}
                  identidad estable que agrupa una estrategia del agente y todo su historial.
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-text-primary">Nota · Versión:</span>{" "}
                  instantánea guardada de esa configuración; después de desplegarse permanece inmutable.
                </p>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
