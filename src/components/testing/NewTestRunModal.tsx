import { useState } from "react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { X } from "lucide-react";
import { DatasetTestForm } from "./DatasetTestForm";
import { FormularioTestForm } from "./FormularioTestForm";
import { GeneradorScenarioForm } from "./GeneradorScenarioForm";

/* ─── New test run, three launch strategies behind one entry point ───────
   The launch area is a side panel, not a modal. Phase C turns it into a
   strategy switcher: Dataset (existing, untouched behavior, now living in
   DatasetTestForm.tsx), Formulario (a raw JSON event dispatched straight
   into the real pipeline via POST /alerts/test) and Generador (configures
   and starts a scenario via aria-api's /api/v0/scenarios).
   Each strategy owns its own form state, validation and submit action -
   this component is just the Dialog chrome + tab switcher. */

type LaunchStrategy = "dataset" | "formulario" | "generador";

export function NewTestRunPanel({
  onClose,
  initialConfigurationId = null,
  initialConfigVersion = null,
}: {
  onClose: () => void;
  // Deep-link pre-fill (from /testing?configurationId=...&version=...) — set
  // by "Probar configuración" in Configuración. Only meaningful for the
  // Dataset strategy, which is why the modal always opens on that tab.
  initialConfigurationId?: string | null;
  initialConfigVersion?: number | null;
}) {
  const [strategy, setStrategy] = useState<LaunchStrategy>("dataset");

  return (
    <aside className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] sticky top-6 self-start max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-text-primary">Nueva prueba</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Elige cómo lanzar el pipeline de 7 pasos.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar nueva prueba"
          className="text-text-secondary hover:text-text-primary shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5">
        <Tabs value={strategy} onValueChange={(v) => setStrategy(v as LaunchStrategy)}>
          <TabsList className="w-full">
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
      </div>
    </aside>
  );
}
