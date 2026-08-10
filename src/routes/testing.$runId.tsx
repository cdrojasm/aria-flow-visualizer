import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, ShieldCheck, ShieldAlert, Database, Clock, Layers } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { findTestRun } from "@/data/testRuns";

export const Route = createFileRoute("/testing/$runId")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Detalle de una ejecución de prueba del agente ARIA." },
    ],
  }),
  component: TestRunDetailPage,
});

function TestRunDetailPage() {
  const { runId } = Route.useParams();
  const run = findTestRun(runId);

  if (!run) {
    return (
      <DashboardLayout>
        <div className="px-8 py-6 max-w-[900px]">
          <nav className="flex items-center gap-1.5 text-[12px] text-text-secondary mb-4">
            <Link to="/testing" className="hover:text-primary">Testing</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-text-primary font-medium">{runId}</span>
          </nav>
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-text-secondary text-[13px]">
            No se encontró esta prueba. Puede que haya sido generada en una sesión anterior.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[900px] space-y-6">
        <div>
          <nav className="flex items-center gap-1.5 text-[12px] text-text-secondary mb-2">
            <Link to="/testing" className="hover:text-primary">Testing</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-text-primary font-medium">{run.id}</span>
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-semibold text-text-primary">{run.configName} · v{run.version}</h1>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md ${run.passed ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
              {run.passed ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              {run.passed ? "Ciclo aprobado" : "Ciclo no aprobado"}
            </span>
          </div>
          <p className="text-[13px] text-text-secondary mt-1">{run.date}</p>
        </div>

        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border flex items-center gap-4 text-[12px] text-text-secondary">
            <span className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> {run.dataset}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {run.duration}</span>
            <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> {run.processed} / {run.total} procesadas</span>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: "Precisión", value: `${run.accuracy.toFixed(2)}%` },
              { label: "Fraude no detectado", value: run.fraudeNoDetectado },
              { label: "Falsos positivos", value: run.falsosPositivos },
              { label: "Tiempo ahorrado", value: run.tiempoAhorrado },
              { label: "Latencia promedio", value: run.latencia },
              { label: "Fallos", value: String(run.failed) },
              { label: "Procesadas", value: `${run.processed} / ${run.total}` },
              { label: "Duración", value: run.duration },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[11px] text-text-secondary">{label}</p>
                <p className="text-[16px] font-semibold text-text-primary font-mono">{value}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
