import { useState } from "react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SideDrawer } from "@/components/ui/side-drawer";
import { DatasetTestForm } from "./DatasetTestForm";
import { FormularioTestForm } from "./FormularioTestForm";
import { GeneradorScenarioForm } from "./GeneradorScenarioForm";

/* ─── New test run, three launch strategies behind one entry point ───────
   The launch area is the shared right-hand SideDrawer. Phase C turns it into a
   strategy switcher: Dataset (existing, untouched behavior, now living in
   DatasetTestForm.tsx), Formulario (a raw JSON event dispatched straight
   into the real pipeline via POST /alerts/test) and Generador (configures
   and starts a scenario via aria-api's /api/v0/scenarios).
   Each strategy owns its own form state, validation and submit action -
   this component is just the drawer chrome + tab switcher. */

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
    <SideDrawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="Nueva prueba"
      description="Elige cómo lanzar el pipeline de 7 pasos."
    >
      <div data-testid="new-test-run-panel">
        <Tabs value={strategy} onValueChange={(v) => setStrategy(v as LaunchStrategy)}>
          <TabsList className="flex h-auto w-full items-center justify-start gap-1 rounded-xl border border-border bg-card p-1.5">
            <TabsTrigger
              value="dataset"
              className="flex-1 rounded-lg px-3 py-2 text-[13px] font-medium text-text-secondary shadow-none hover:text-text-primary data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
            >
              Dataset
            </TabsTrigger>
            <TabsTrigger
              value="formulario"
              className="flex-1 rounded-lg px-3 py-2 text-[13px] font-medium text-text-secondary shadow-none hover:text-text-primary data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
            >
              Formulario
            </TabsTrigger>
            <TabsTrigger
              value="generador"
              className="flex-1 rounded-lg px-3 py-2 text-[13px] font-medium text-text-secondary shadow-none hover:text-text-primary data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none"
            >
              Generador
            </TabsTrigger>
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
    </SideDrawer>
  );
}
