import { ModelTrainingWizard } from "@/components/modelos/ModelTrainingWizard";
import { ModelTrainingResults } from "@/components/modelos/ModelTrainingResults";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Play, Plus, Power, Trash2 } from "lucide-react";
import { useState } from "react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  ActionButton,
  DataTable,
  TruncText,
  type DataTableColumn,
} from "@/components/ui/DataTable";
import { Progress } from "@/components/ui/progress";
import { SectionTabs } from "@/components/ui/section-tabs";
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
        content: "Creación, entrenamiento único y activación de modelos XGBoost servidos vía MCP.",
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

const formatCreatedAt = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

const modelColumns: DataTableColumn<ModelResponse>[] = [
  {
    key: "tag",
    label: "Tag",
    minWidth: 200,
    sortValue: (m) => m.tag,
    searchValue: (m) => `${m.tag} ${m.description}`,
    render: (m) => (
      <div>
        <TruncText maxWidth={240} className="font-medium text-text-primary">
          {m.tag}
        </TruncText>
        <TruncText maxWidth={240} className="text-[11px] text-text-secondary">
          {m.description}
        </TruncText>
      </div>
    ),
  },
  {
    key: "dataset",
    label: "Dataset",
    minWidth: 180,
    sortValue: (m) => m.dataset_name,
    searchValue: (m) => m.dataset_name,
    render: (m) => (
      <TruncText maxWidth={200} className="text-text-secondary">
        {m.dataset_name}
      </TruncText>
    ),
  },
  {
    key: "created_at",
    label: "Creado",
    minWidth: 130,
    sortValue: (m) => (m.created_at ? new Date(m.created_at).getTime() : null),
    render: (m) => (
      <span className="text-text-secondary tabular-nums whitespace-nowrap">
        {m.created_at ? formatCreatedAt(m.created_at) : "—"}
      </span>
    ),
  },
  {
    key: "status",
    label: "Estado",
    minWidth: 110,
    sortValue: (m) => STATUS_LABELS[m.status],
    render: (m) => (
      <div>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${STATUS_STYLE[m.status]}`}
        >
          {STATUS_LABELS[m.status]}
        </span>
        {m.error && (
          <TruncText maxWidth={200} className="text-[11px] text-danger mt-1">
            {m.error}
          </TruncText>
        )}
      </div>
    ),
  },
  {
    key: "metrics",
    label: "Métricas",
    minWidth: 160,
    sortValue: (m) => m.metrics?.["roc_auc"] ?? null,
    render: (m) => (
      <span className="text-text-secondary whitespace-nowrap">
        {m.metrics
          ? `ROC-AUC ${m.metrics["roc_auc"]?.toFixed(3)} · F1 ${m.metrics["f1_macro"]?.toFixed(3)}`
          : "—"}
      </span>
    ),
  },
  {
    key: "active",
    label: "Activo",
    minWidth: 80,
    sortValue: (m) => (m.active ? 1 : 0),
    render: (m) =>
      m.active ? (
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-success/10 text-success">
          Activo
        </span>
      ) : (
        <span className="text-text-secondary">—</span>
      ),
  },
];

function ModelosPage() {
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModelResponse | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("catalog");

  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: getModels,
    // Picks up TRAINING -> READY/FAILED transitions without a manual
    // refresh - same interval as the training-progress poll below.
    refetchInterval: 4000,
  });
  const models = modelsQuery.data ?? [];
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ??
    models.find((model) => model.active) ??
    models[0] ??
    null;

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
      queryClient.invalidateQueries({
        queryKey: ["asyncOperations", "model_training"],
      });
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

  const actionButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <DashboardLayout
      bottomBar={
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="min-w-0 text-[12px] text-text-secondary" role="status">
            <p className="font-medium text-text-primary">
              {selectedModel
                ? `${selectedModel.tag} · ${STATUS_LABELS[selectedModel.status]}`
                : "Selecciona un modelo"}
            </p>
            <p>
              {selectedModel?.active
                ? "Modelo activo en producción"
                : selectedModel?.status === "TRAINING"
                  ? "Entrenamiento en curso; el estado se actualiza automáticamente"
                  : "Selecciona una acción para este modelo"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!selectedModel}
              onClick={() => selectedModel && setResultId(selectedModel.id)}
              className={`${actionButtonClass} border border-border hover:bg-surface`}
            >
              <Eye className="h-4 w-4" /> Ver detalle
            </button>
            {selectedModel && !selectedModel.active && (
              <button
                type="button"
                disabled={selectedModel.status !== "READY" || activateMutation.isPending}
                onClick={() => activateMutation.mutate(selectedModel.id)}
                className={`${actionButtonClass} border border-primary text-primary hover:bg-primary/5`}
              >
                {activateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                Activar en producción
              </button>
            )}
            {selectedModel && !selectedModel.active && (
              <button
                type="button"
                disabled={selectedModel.status !== "DRAFT" || trainMutation.isPending}
                onClick={() => trainMutation.mutate(selectedModel.id)}
                className={`${actionButtonClass} bg-primary text-white hover:bg-primary/90`}
              >
                {trainMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Entrenar por única vez
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <header>
          <h1 className="text-[20px] font-semibold text-text-primary">Modelos</h1>
        </header>

        <SectionTabs
          label="Secciones de motores"
          items={[
            { key: "catalog", label: "Catálogo y resultados" },
            {
              key: "operations",
              label: `Operaciones${trainingOps.length ? ` (${trainingOps.length})` : ""}`,
            },
          ]}
          value={activeSection}
          onValueChange={setActiveSection}
        />

        {activeSection === "catalog" && (
          <DataTable
            storageKey="modelos-catalogo"
            title="Modelos"
            description="Crea y entrena una única vez modelos XGBoost sobre datasets del sistema. El servicio MCP sirve el modelo que actives aquí a los agentes que lo consulten."
            tableActions={
              <ActionButton
                tone="primary"
                size="md"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setWizardOpen(true)}
              >
                Nuevo modelo
              </ActionButton>
            }
            itemLabel="modelo"
            rows={models}
            rowKey={(m) => m.id}
            columns={modelColumns}
            actions={(m) => (
              <>
                <ActionButton
                  icon={<Eye className="h-3 w-3" />}
                  onClick={() => {
                    setSelectedModelId(m.id);
                    setResultId(m.id);
                  }}
                >
                  Ver
                </ActionButton>
                <ActionButton
                  tone="primary"
                  icon={<Play className="h-3 w-3" />}
                  disabled={m.status !== "DRAFT" || m.active || trainMutation.isPending}
                  onClick={() => {
                    setSelectedModelId(m.id);
                    trainMutation.mutate(m.id);
                  }}
                >
                  Entrenar
                </ActionButton>
                <ActionButton
                  icon={<Power className="h-3 w-3" />}
                  disabled={m.active || m.status !== "READY" || activateMutation.isPending}
                  onClick={() => {
                    setSelectedModelId(m.id);
                    activateMutation.mutate(m.id);
                  }}
                >
                  Activar
                </ActionButton>
                <ActionButton
                  tone="danger"
                  icon={<Trash2 className="h-3 w-3" />}
                  onClick={() => {
                    setSelectedModelId(m.id);
                    setDeleteTarget(m);
                  }}
                >
                  Borrar
                </ActionButton>
              </>
            )}
            actionsWidth={260}
            defaultSort={{ key: "created_at", dir: "desc" }}
            isLoading={modelsQuery.isLoading}
            emptyLabel="Sin modelos todavía."
          />
        )}

        {activeSection === "operations" && (
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-[14px] font-semibold text-text-primary">
                Progreso de entrenamiento
              </h2>
              <p className="text-[12px] text-text-secondary mt-0.5">
                Las operaciones se actualizan automáticamente mientras el entrenamiento esté en
                curso.
              </p>
            </div>
            <div className="p-6 space-y-4">
              {trainingOps.length === 0 ? (
                <p className="text-[13px] text-text-secondary">No hay entrenamientos en curso.</p>
              ) : (
                trainingOps.map((op) => {
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
                })
              )}
            </div>
          </section>
        )}
      </div>

      {wizardOpen && <ModelTrainingWizard open onClose={() => setWizardOpen(false)} />}
      {resultId && (
        <ModelTrainingResults key={resultId} id={resultId} onClose={() => setResultId(null)} />
      )}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        itemName={deleteTarget?.tag ?? ""}
        consequence="Se eliminará el modelo y su registro de entrenamiento (el artefacto en MinIO no se borra automáticamente)."
        pending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </DashboardLayout>
  );
}
