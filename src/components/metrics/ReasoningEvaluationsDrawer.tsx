import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { SideDrawer } from "@/components/ui/side-drawer";
import { VerdictBadge } from "@/components/alert/ReasoningEvaluationTab";
import {
  listReasoningEvaluations,
  type ReasoningEvaluationFilters,
} from "@/lib/api/reasoningEvaluation.functions";

/* Alerts the LLM-judge evaluated in a period (max 31 days), filterable by
   verdict, each linking to the alert's "Evaluación de calidad" tab. */

type Verdict = "all" | "hallucination" | "bad_data" | "clean" | "invalid";

function isoDay(offsetDays: number) {
  const date = new Date(Date.now() - offsetDays * 86_400_000);
  return date.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function filtersFor(verdict: Verdict, days: number): ReasoningEvaluationFilters {
  const base = { fromDay: isoDay(days - 1), toDay: isoDay(0) };
  switch (verdict) {
    case "hallucination":
      return { ...base, hallucination: true };
    case "bad_data":
      return { ...base, dataUseCorrect: false };
    case "clean":
      return { ...base, hallucination: false, dataUseCorrect: true };
    case "invalid":
      return { ...base, status: "invalid" };
    default:
      return base;
  }
}

const OPTIONS: Array<{ key: Verdict; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "hallucination", label: "Con alucinación" },
  { key: "bad_data", label: "Uso incorrecto de datos" },
  { key: "clean", label: "Sin hallazgos" },
  { key: "invalid", label: "Inválidas" },
];

export function ReasoningEvaluationsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [verdict, setVerdict] = useState<Verdict>("hallucination");
  const [days, setDays] = useState(7);
  const list = useQuery({
    queryKey: ["reasoningEvaluations", verdict, days],
    queryFn: () => listReasoningEvaluations(filtersFor(verdict, days)),
    enabled: open,
    retry: false,
  });
  return (
    <SideDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Alertas evaluadas por el LLM-judge"
      description="Una muestra aleatoria de las alertas terminadas. Abre una para ver la justificación del evaluador."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Veredicto"
          value={verdict}
          onChange={(event) => setVerdict(event.target.value as Verdict)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
        >
          {OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Periodo"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
        >
          {[1, 7, 15, 31].map((value) => (
            <option key={value} value={value}>
              {value === 1 ? "Hoy" : `Últimos ${value} días`}
            </option>
          ))}
        </select>
      </div>
      {list.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {list.isError && (
        <p role="alert" className="text-[13px] text-danger">
          No se pudieron cargar las evaluaciones.
        </p>
      )}
      {list.data?.length === 0 && (
        <p className="text-[13px] text-text-secondary">
          Ninguna alerta evaluada coincide con el filtro en este periodo.
        </p>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {(list.data ?? []).map((item) => (
          <li key={item.alert_id} className="space-y-1 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/alerta/$id"
                params={{ id: item.alert_id }}
                className="font-mono text-[12px] text-primary underline"
              >
                {item.alert_id}
              </Link>
              {item.status === "invalid" ? (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning">
                  Inválida
                </span>
              ) : (
                <>
                  <VerdictBadge
                    ok={item.hallucination === null ? null : !item.hallucination}
                    okLabel="Sin alucinaciones"
                    badLabel="Alucinación"
                  />
                  <VerdictBadge
                    ok={item.data_use_correct}
                    okLabel="Datos bien usados"
                    badLabel="Datos mal usados"
                  />
                </>
              )}
              <span className="ml-auto text-[11px] text-text-secondary">
                {item.evaluated_at.slice(0, 10)} · {item.judge_model}
              </span>
            </div>
            {item.rationale && <p className="text-[12px] text-text-secondary">{item.rationale}</p>}
          </li>
        ))}
      </ul>
    </SideDrawer>
  );
}
