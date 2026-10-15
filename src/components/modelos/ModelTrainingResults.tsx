import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SectionTabs } from "@/components/ui/section-tabs";
import { getModel } from "@/lib/api/models.functions";
import { ModelContractTester } from "./ModelContractTester";
const panel = "rounded-xl border border-border bg-card p-5 space-y-3";
function Curve({
  title,
  data,
  x,
  y,
  second,
}: {
  title: string;
  data: Record<string, number>[];
  x: string;
  y: string;
  second?: string;
}) {
  return (
    <section className={panel}>
      <h3 className="font-semibold">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={x} />
            <YAxis />
            <Tooltip />
            <Line dataKey={y} stroke="#1464a5" dot={false} />
            {second && <Line dataKey={second} stroke="#cf8b17" dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
export function ModelTrainingResults({ id, onClose }: { id: string; onClose: () => void }) {
  const [tab, setTab] = useState("metrics");
  const [threshold, setThreshold] = useState<number | null>(null);
  const model = useQuery({
    queryKey: ["model", id],
    queryFn: () => getModel({ data: { id } }),
    refetchInterval: 4000,
  });
  const report = model.data?.training_report;
  const metrics = model.data?.metrics;
  const selected = report?.thresholds.reduce(
    (best, row) =>
      Math.abs(row.threshold - (threshold ?? report.threshold)) <
      Math.abs(best.threshold - (threshold ?? report.threshold))
        ? row
        : best,
    report.thresholds[0],
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden max-w-6xl w-[96vw] h-[90vh]">
        <DialogHeader className="p-6 pr-12 border-b border-border">
          <DialogTitle>{model.data?.tag ?? "Modelo"}</DialogTitle>
          <DialogDescription>
            {report
              ? "Resultados reales sobre el conjunto de prueba independiente. Las probabilidades están calibradas."
              : "Configuración y resultados del entrenamiento."}
          </DialogDescription>
        </DialogHeader>
        <SectionTabs
          label="Detalle del modelo"
          items={[
            { key: "metrics", label: "Desempeño" },
            { key: "curves", label: "Curvas" },
            { key: "features", label: "Características" },
            { key: "config", label: "Ejecución y receta" },
            { key: "contract", label: "Probar contrato" },
          ]}
          value={tab}
          onValueChange={setTab}
          className="px-6"
        />
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-text-primary">
          {model.isLoading && <p>Cargando modelo…</p>}
          {model.isError && (
            <p role="alert" className="text-danger">
              No se pudo cargar el modelo.{" "}
              <button className="underline" onClick={() => model.refetch()}>
                Reintentar
              </button>
            </p>
          )}
          {model.data?.error && (
            <p role="alert" className="rounded bg-danger/10 p-3">
              {model.data.error}
            </p>
          )}
          {!report && model.data && (
            <p className="text-sm bg-warning/10 rounded p-3">
              {model.data.status === "READY"
                ? "Este modelo se entrenó antes del informe detallado. Sus métricas anteriores no proceden de la nueva separación de prueba."
                : `Estado: ${model.data.status}. El informe estará disponible al completar el entrenamiento.`}
            </p>
          )}
          {tab === "metrics" && metrics && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["ROC-AUC", "roc_auc"],
                  ["Average Precision", "average_precision"],
                  ["Precisión", "precision"],
                  ["Recall de fraude", "recall"],
                  ["F1 de fraude", "f1"],
                  ["Brier score", "brier_score"],
                  ["Log loss", "log_loss"],
                  ["Registros de prueba", "n_test"],
                ].map(([label, key]) => (
                  <section key={key} className={panel}>
                    <p className="text-xs text-text-secondary">{label}</p>
                    <p className="text-2xl font-semibold">
                      {metrics[key] === undefined
                        ? "—"
                        : key === "n_test"
                          ? metrics[key]
                          : metrics[key].toFixed(3)}
                    </p>
                  </section>
                ))}
              </div>
              {report && selected && (
                <>
                  <section className={panel}>
                    <h3 className="font-semibold">
                      Explorar umbral · {selected.threshold.toFixed(2)}
                    </h3>
                    <input
                      aria-label="Umbral exploratorio"
                      className="w-full accent-primary"
                      type="range"
                      min="0.05"
                      max="0.95"
                      step="0.05"
                      value={threshold ?? report.threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                    />
                    <p className="text-sm text-text-secondary">
                      Umbral guardado: {report.threshold.toFixed(2)}, elegido en validación. Este
                      control solo explora resultados; no modifica el modelo ni debe usarse para
                      ajustar el umbral con la prueba.
                    </p>
                    <div className="flex flex-wrap gap-5 text-sm">
                      <span>Precisión: {selected.precision.toFixed(3)}</span>
                      <span>Recall: {selected.recall.toFixed(3)}</span>
                      <span>Alertas: {selected.alerts}</span>
                    </div>
                  </section>
                  <section className={panel}>
                    <h3 className="font-semibold">Matriz de confusión · umbral explorado</h3>
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr>
                          <th className="p-3">Clase real</th>
                          <th>Alerta</th>
                          <th>Sin alerta</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-primary/5">
                          <th className="p-3">Fraude</th>
                          <td>{selected.tp} detectados</td>
                          <td>{selected.fn} no detectados</td>
                        </tr>
                        <tr>
                          <th className="p-3">Legítimo</th>
                          <td>{selected.fp} falsos positivos</td>
                          <td>{selected.tn} correctos</td>
                        </tr>
                      </tbody>
                    </table>
                  </section>
                </>
              )}
            </>
          )}
          {tab === "contract" && model.data && <ModelContractTester model={model.data} />}
          {tab === "curves" && report && (
            <div className="grid md:grid-cols-2 gap-5">
              <Curve
                title="Log loss de entrenamiento y validación"
                data={report.learning_curve}
                x="iteration"
                y="training"
                second="validation"
              />
              <Curve title="ROC · prueba" data={report.roc_curve} x="fpr" y="tpr" />
              <Curve
                title="Precisión y recall · prueba"
                data={report.precision_recall_curve}
                x="recall"
                y="precision"
              />
              <Curve
                title="Calibración · predicho frente a observado"
                data={report.calibration_curve}
                x="predicted"
                y="observed"
              />
            </div>
          )}
          {tab === "features" && report && (
            <section className={panel}>
              <h3 className="font-semibold">Importancia global · ganancia normalizada</h3>
              <p className="text-xs text-text-secondary">
                Hasta 30 características. Describe el uso de las variables por los árboles; no
                representa causalidad ni contribuciones SHAP por caso.
              </p>
              {report.feature_importance.map((f) => (
                <div key={f.feature} className="space-y-1">
                  <div className="flex justify-between text-xs gap-4">
                    <span className="break-all">{f.feature}</span>
                    <span>{(100 * f.importance).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded bg-primary/10">
                    <div
                      className="h-2 rounded bg-primary"
                      style={{ width: `${100 * f.importance}%` }}
                    />
                  </div>
                </div>
              ))}
            </section>
          )}
          {tab === "config" && model.data && (
            <>
              <section className={panel}>
                <h3 className="font-semibold">Dataset y ejecución</h3>
                <p className="text-sm">
                  {model.data.dataset_name} · objetivo: {model.data.target_field} · positivos:{" "}
                  {model.data.positive_labels.join(", ")}
                </p>
                {report && (
                  <>
                    <p className="text-sm">
                      {report.duration_seconds.toFixed(1)} s · mejor iteración{" "}
                      {report.best_iteration} · {report.feature_count} características ·{" "}
                      {report.split_strategy} · {report.timezone}
                    </p>
                    <div className="grid sm:grid-cols-4 gap-3">
                      {Object.entries(report.partitions).map(([key, v]) => (
                        <div key={key} className="text-sm">
                          <p className="font-medium">{key}</p>
                          <p>
                            {v.rows} filas · {v.positive} positivos
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs break-all text-text-secondary">
                      Huella SHA-256 del dataset usado: {report.dataset_sha256}
                    </p>
                  </>
                )}
              </section>
              <section className={panel}>
                <h3 className="font-semibold">Receta persistida</h3>
                <pre className="text-xs whitespace-pre-wrap break-all">
                  {JSON.stringify(
                    {
                      training_config: model.data.training_config,
                      feature_transforms: model.data.feature_transforms,
                      historical_features: model.data.historical_features,
                    },
                    null,
                    2,
                  )}
                </pre>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
