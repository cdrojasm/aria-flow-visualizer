import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function CapabilityInfo({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Información: ${label}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,560px)] max-h-[75vh] overflow-y-auto p-4" align="start">
        <h3 className="mb-3 text-[13px] font-semibold text-text-primary">{title}</h3>
        {children}
      </PopoverContent>
    </Popover>
  );
}

const card = "rounded-lg border border-border bg-card p-3";
const node = "rounded-lg border border-border bg-surface px-3 py-2 text-center text-[11px] font-medium text-text-primary";

export function LifecycleDiagram() {
  const stages = [
    ["Evento", "Alerta"],
    ["Preparar", "Reglas y perfil"],
    ["Analizar", "Modelo y agente"],
    ["Revisar", "Contrastar evidencia"],
    ["Resolver", "Playbook"],
    ["Medir", "Resultado"],
    ["Aprender", "Mejora continua"],
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stages.map(([title, detail], index) => (
          <div key={title} className={`${node} ${index === 4 ? "border-primary/30 bg-primary/5" : ""}`}>
            <div>{title}</div>
            <div className="mt-0.5 text-[10px] font-normal text-text-secondary">{detail}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
        ARIA procesa la alerta, registra cómo se resolvió y usa resultados maduros para evaluar
        futuras mejoras.
      </p>
    </div>
  );
}

export function PipelineDiagram() {
  const stages = [
    "Preparación",
    "Reglas",
    "Perfilamiento",
    "Detector",
    "Adversarial del detector",
    "Clasificación",
    "Adversarial del clasificador",
    "Analista",
    "Ejecutor",
    "Postproceso",
  ];
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {stages.map((stage, index) => (
        <li key={stage} className={card}>
          <span className="text-[10px] font-semibold tabular-nums text-primary">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="mt-1 text-[11px] font-medium leading-snug text-text-primary">{stage}</div>
        </li>
      ))}
    </ol>
  );
}

export function XgboostDiagram() {
  const signals = [
    ["Señales del dispositivo", 88],
    ["Monto y canal", 57],
    ["Hora de operación", 32],
  ] as const;
  return (
    <div className="space-y-3">
      <div className={`${card} text-[11px] text-text-secondary`}>
        El modelo aprende patrones de alertas resueltas y calcula un puntaje para una alerta nueva.
      </div>
      {signals.map(([label, strength]) => (
        <div key={label}>
          <div className="mb-1 flex justify-between gap-2 text-[10px] text-text-secondary">
            <span>{label}</span><span>{strength}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${strength}%` }} />
          </div>
        </div>
      ))}
      <p className="text-[10px] leading-relaxed text-text-secondary">
        SHAP muestra qué señales empujaron el puntaje hacia cada resultado. El umbral configurado
        ayuda a decidir cuándo investigar más.
      </p>
    </div>
  );
}

export function ResolutionDiagram() {
  return (
    <div className="space-y-3">
      <div className={`${node} mx-auto max-w-[220px] border-primary/30 bg-primary/5`}>
        Agente ARIA
        <div className="mt-0.5 text-[10px] font-normal text-text-secondary">
          Lee el playbook y la disponibilidad
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          ["Acción directa", "Bloquear · Bidi · Dejar pasar"],
          ["Voicebot", "Reserva un cupo y contacta al cliente"],
          ["Analista", "Recibe la alerta para revisión humana"],
        ].map(([title, detail]) => (
          <div key={title} className={`${card} text-center`}>
            <div className="text-[11px] font-semibold text-text-primary">{title}</div>
            <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">{detail}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-center text-[10px] text-text-primary">
        Si una ruta no está disponible, el playbook define el respaldo. Toda resolución queda
        registrada y medida.
      </div>
    </div>
  );
}
