import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Power, Trash2 } from "lucide-react";
import { useState } from "react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { ModelFormModal } from "@/components/modelos/ModelFormModal";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { PaginationFooter } from "@/components/ui/PaginationFooter";
import { Progress } from "@/components/ui/progress";
import { usePagination } from "@/hooks/usePagination";
import { listAsyncOperations } from "@/lib/api/asyncOperations.functions";
import {
  activateModel,
  deleteModel,
  getModels,
  trainModel,
  type ModelResponse,
  type ModelStatus,
} from "@/lib/api/models.functions";

export const Route = createFileRoute("/modelos")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      {
        name: "description",
        content: "Entrenamiento y versionado de modelos XGBoost servidos vía MCP.",
      },
    ],
  }),
  component: ModelosPage,
});

const STATUS_STYLE: Record<ModelStatus, string> = {
  DRAFT: "bg-warning/10 text-warning",
  TRAINING: "bg-primary/10 text-primary",
  READY: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

const STATUS_LABELS: Record<ModelStatus, string> = {
  DRAFT: "Borrador",
  TRAINING: "Entrenando",
  READY: "Listo",
  FAILED: "Falló",
};

function ModelosPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ModelResponse | null>(null);

  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: getModels,
    // Picks up TRAINING -> READY/FAILED transitions without a manual
    // refresh - same interval as the training-progress poll below.
    refetchInterval: 4000,
  });
  const models = modelsQuery.data ?? [];
  // Model actions still use the complete model object; pagination only limits
  // the rows rendered in the table.
  const modelsPage = usePagination(models, 10);

  // "current training progress" table (task 7): the generic
  // /async-operations abstraction is the source of truth for progress
  // (result.stage / result.progress_pct, written incrementally by
  // train_model_task) - filtered client-side to this operation_type since
  // the backend doesn't expose a type filter.
  const trainingOpsQuery = useQuery({
    queryKey: ["asyncOperations", "model_training"],
    queryFn: () => listAsyncOperations(),
    refetchInterval: 4000,
  });
  const trainingOps = (trainingOpsQuery.data ?? []).filter(
    (op) =>
      op.operation_type === "model_training" &&
      (op.status === "PENDING" || op.status === "DISPATCHED" || op.status === "RUNNING"),
  );

  const trainMutation = useMutation({
    mutationFn: (id: string) => trainModel({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
      queryClient.invalidateQueries({ queryKey: ["asyncOperations", "model_training"] });
    },
  });
  const activateMutation = useMutation({
    mutationFn: (id: string) => activateModel({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["models"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteModel({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
      setDeleteTarget(null);
    },
  });

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-text-primary">Modelos</h1>
            <p className="text-[13px] text-text-secondary mt-1">
              Entrena y versiona modelos XGBoost sobre datasets del sistema. El servicio MCP sirve
              la versión que actives aquí a los agentes que la consulten.
            </p>
          </div>
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-medium bg-primary text-white shrink-0"
          >
            <Plus className="h-4 w-4" /> Crear modelo
          </button>
        </header>

        {trainingOps.length > 0 && (
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-[14px] font-semibold text-text-primary">
                Progreso de entrenamiento
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {trainingOps.map((op) => {
                const stage = (op.result?.stage as string | undefined) ?? op.status;
                const pct = (op.result?.progress_pct as number | undefined) ?? 0;
                const tag =
                  (op.payload?.tag as string | undefined) ?? String(op.payload?.model_id ?? "");
                return (
                  <div key={op.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-medium text-text-primary">{tag}</span>
                      <span className="text-text-secondary">
                        {stage} · {pct}%
                      </span>
                    </div>
                    <Progress value={pct} />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">Modelos</h2>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-secondary border-b border-border">
                <th className="px-6 py-2.5 font-medium">Tag</th>
                <th className="px-6 py-2.5 font-medium">Dataset</th>
                <th className="px-6 py-2.5 font-medium">Estado</th>
                <th className="px-6 py-2.5 font-medium">Métricas</th>
                <th className="px-6 py-2.5 font-medium">Activo</th>
                <th className="px-6 py-2.5 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-text-secondary">
                    Sin modelos todavía.
                  </td>
                </tr>
              )}
              {modelsPage.pageItems.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3">
                    <div className="font-medium text-text-primary">{m.tag}</div>
                    <div className="text-[11px] text-text-secondary">{m.description}</div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{m.dataset_name}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${STATUS_STYLE[m.status]}`}
                    >
                      {STATUS_LABELS[m.status]}
                    </span>
                    {m.error && <div className="text-[11px] text-danger mt-1">{m.error}</div>}
                  </td>
                  <td className="px-6 py-3 text-text-secondary">
                    {m.metrics ? (
                      <>
                        ROC-AUC {m.metrics["roc_auc"]?.toFixed(3)} · F1{" "}
                        {m.metrics["f1_macro"]?.toFixed(3)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {m.active ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-success/10 text-success">
                        Activo
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={m.status !== "READY" || activateMutation.isPending}
                        onClick={() => activateMutation.mutate(m.id)}
                        className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-40"
                        title="Activar"
                      >
                        <Power className="h-3.5 w-3.5" /> Activar
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        disabled={m.status === "TRAINING" || trainMutation.isPending}
                        onClick={() => trainMutation.mutate(m.id)}
                        className="text-[12px] text-primary disabled:opacity-40"
                      >
                        Entrenar
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(m)}
                        className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationFooter
            page={modelsPage.page}
            pageCount={modelsPage.pageCount}
            total={modelsPage.total}
            pageSize={modelsPage.pageSize}
            onPageChange={modelsPage.setPage}
            itemLabel="modelo"
          />
        </section>
      </div>

      <ModelFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        itemName={deleteTarget?.tag ?? ""}
        consequence="Se eliminará el modelo y su registro de versión (el artefacto en MinIO no se borra automáticamente)."
        pending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </DashboardLayout>
  );
}
