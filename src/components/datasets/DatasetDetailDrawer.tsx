import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatasetSummaryTab } from "./DatasetSummaryTab";
import { DatasetRowsTab } from "./DatasetRowsTab";
import { DatasetMappingTab } from "./DatasetMappingTab";

export function DatasetDetailDrawer({
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
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Dataset: {datasetName}</DialogTitle>
          <DialogDescription>
            Resumen y distribución de campos, filas, y mapeo de campos de alerta.
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0: DialogContent is a CSS grid, and grid items default to
            min-width: auto - without this, a dataset with many columns
            (e.g. 54) forces its intrinsic table width onto this whole grid
            item, blowing the dialog out horizontally instead of the
            table's own overflow-x-auto handling it. */}
        {datasetName && (
          <Tabs defaultValue="summary" className="min-w-0">
            <TabsList>
              <TabsTrigger value="summary">Resumen</TabsTrigger>
              <TabsTrigger value="rows">Filas</TabsTrigger>
              <TabsTrigger value="mapping">Mapeo de alertas</TabsTrigger>
            </TabsList>
            <TabsContent value="summary">
              <DatasetSummaryTab datasetName={datasetName} />
            </TabsContent>
            <TabsContent value="rows">
              <DatasetRowsTab datasetName={datasetName} />
            </TabsContent>
            <TabsContent value="mapping">
              <DatasetMappingTab datasetName={datasetName} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
