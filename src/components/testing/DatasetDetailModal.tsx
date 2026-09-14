import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatasetSummaryTab } from "@/components/datasets/DatasetSummaryTab";

/* ─── Dataset detail, read-only picker context (Phase 1 of
   DATASETS_LIBRARY_DESIGN.md) ────────────────────────────────────────
   Was a full management view (distributions + delete) - Biblioteca →
   Datasets is now the single place that manages datasets (upload,
   extract, delete, progressive fill). This stays only as a convenience
   so an analyst can eyeball a dataset's distributions without leaving
   the "nueva prueba" flow, sourced from the same DatasetSummaryTab
   Biblioteca's detail drawer uses - no duplicated rendering, no delete
   action here. */

export function DatasetDetailModal({
  datasetName,
  open,
  onClose,
}: {
  datasetName: string | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dataset: {datasetName}</DialogTitle>
          <DialogDescription className="flex items-center justify-between gap-3">
            <span>Totales y distribución de campos del dataset seleccionado.</span>
            <Link
              to="/biblioteca"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline shrink-0"
            >
              Gestionar en Biblioteca <ExternalLink className="h-3 w-3" />
            </Link>
          </DialogDescription>
        </DialogHeader>

        {datasetName && <DatasetSummaryTab datasetName={datasetName} />}
      </DialogContent>
    </Dialog>
  );
}
