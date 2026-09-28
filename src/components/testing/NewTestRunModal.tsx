import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DatasetTestForm } from "./DatasetTestForm";
import { FormularioTestForm } from "./FormularioTestForm";
import { GeneradorScenarioForm } from "./GeneradorScenarioForm";

/* ─── New test run, three launch strategies behind one entry point ───────
   Was a single always-Dataset modal (Phase B). Phase C turns it into a
   strategy switcher: Dataset (existing, untouched behavior, now living in
   DatasetTestForm.tsx), Formulario (a raw JSON event dispatched straight
   into the real pipeline via POST /alerts/test) and Generador (configures
   and starts a scenario via aria-api's /api/v0/scenarios).
   Each strategy owns its own form state, validation and submit action -
   this component is just the Dialog chrome + tab switcher. */

type LaunchStrategy = "dataset" | "formulario" | "generador";

export function NewTestRunModal({
  open,
  onClose,
  initialConfigurationId = null,
  initialConfigVersion = null,
}: {
  open: boolean;
  onClose: () => void;
  // Deep-link pre-fill (from /testing?configurationId=...&version=...) — set
  // by "Probar configuración" in Configuración. Only meaningful for the
  // Dataset strategy, which is why the modal always opens on that tab.
  initialConfigurationId?: string | null;
  initialConfigVersion?: number | null;
}) {
  const [strategy, setStrategy] = useState<LaunchStrategy>("dataset");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          // Reset to the default tab for the next time this modal opens -
          // it fully unmounts on close (Radix Dialog), so this just avoids
          // a stale tab flashing before the reset would've happened anyway.
          setStrategy("dataset");
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva prueba</DialogTitle>
          <DialogDescription>
            Elige cómo lanzar la prueba del pipeline de 7 pasos: sobre un dataset, con un evento
            preformado por formulario, o con un generador de eventos sintéticos.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={strategy} onValueChange={(v) => setStrategy(v as LaunchStrategy)}>
          <TabsList>
            <TabsTrigger value="dataset">Dataset</TabsTrigger>
            <TabsTrigger value="formulario">Formulario</TabsTrigger>
            <TabsTrigger value="generador">Generador</TabsTrigger>
          </TabsList>

          <TabsContent value="dataset">
            <DatasetTestForm
              onClose={onClose}
              initialConfigurationId={initialConfigurationId}
              initialConfigVersion={initialConfigVersion}
            />
          </TabsContent>
          <TabsContent value="formulario">
            <FormularioTestForm />
          </TabsContent>
          <TabsContent value="generador">
            <GeneradorScenarioForm onClose={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
