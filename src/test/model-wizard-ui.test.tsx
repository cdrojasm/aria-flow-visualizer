import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelTrainingWizard } from "@/components/modelos/ModelTrainingWizard";

const { schemaField } = vi.hoisted(() => ({
  schemaField: (field: string, over: Record<string, unknown> = {}) => ({
    id: field,
    data_source: "aric",
    field,
    field_name: field,
    field_ds_loc: "",
    type: "string",
    is_alert: true,
    is_mandatory: false,
    is_history: false,
    is_core: false,
    is_label: false,
    is_sensible: false,
    sensitivity_strategy: null,
    group: "",
    description: "",
    use_locale: false,
    locale_type: null,
    ...over,
  }),
}));

vi.mock("@/lib/api/alertSchema.functions", () => ({
  getActiveAlertSchema: vi.fn().mockResolvedValue({
    version: 7,
    status: "active",
    field_roles: {},
    fields: [
      schemaField("marcacion_final", { is_label: true }),
      schemaField("channel"),
      schemaField("customer_key", { is_identifier: true }),
    ],
  }),
}));
vi.mock("@/lib/api/datasets.functions", () => ({
  getDatasets: vi.fn().mockResolvedValue([{ name: "ds1", row_count: 100 }]),
  getDatasetSummary: vi.fn().mockResolvedValue({
    total_rows: 100,
    available_fields: ["channel", "marcacion_final"],
    field_distributions: {
      marcacion_final: [
        { value: "risk", count: 10 },
        { value: "ok", count: 90 },
      ],
    },
  }),
  getAlertFieldMapping: vi.fn().mockResolvedValue({ mappings: {} }),
}));
const { createModel } = vi.hoisted(() => ({
  createModel: vi.fn().mockResolvedValue({ id: "m-1" }),
}));
vi.mock("@/lib/api/models.functions", () => ({ createModel, trainModel: vi.fn() }));
vi.mock("@/components/modelos/FeatureRecipeWorkspace", () => ({
  FeatureRecipeWorkspace: () => <div>workspace</div>,
  HistoryMappingControls: () => <div>historial</div>,
}));

const config = {
  n_estimators: 400,
  max_depth: 4,
  learning_rate: 0.03,
  subsample: 0.8,
  colsample_bytree: 0.8,
  reg_lambda: 1,
  min_child_weight: 3,
  scale_pos_weight: null,
  early_stopping_rounds: 30,
  split_strategy: "temporal",
  time_field: "channel",
  timezone: "America/Bogota",
};
const recipe = (name: string, path: string) => ({
  id: name,
  name,
  description: "",
  enabled: true,
  source: "current",
  missing: { policy: "missing" },
  steps: [
    { id: "1", operation: "select", path },
    { id: "2", operation: "categorize", rules: [] },
  ],
});
const draft = (recipes: unknown[], extra: Record<string, unknown> = {}) =>
  localStorage.setItem(
    "aria.model-training.draft.v1",
    JSON.stringify({
      version: 1,
      step: "3",
      tag: "m1",
      description: "",
      dataset: "ds1",
      target: "marcacion_final",
      positive: ["risk"],
      features: [],
      history: [],
      config,
      recipeConfiguration: {
        schema_version: 2,
        mappings: { timezone: "America/Bogota" },
        recipes,
      },
      ...extra,
    }),
  );

function renderWizard() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ModelTrainingWizard open onClose={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe("asistente de entrenamiento", () => {
  it("sugiere el campo etiqueta del esquema y avisa si el objetivo no lo es", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByRole("option", { name: /ds1/ });
    await user.selectOptions(screen.getByDisplayValue("Selecciona un dataset"), "ds1");
    const target = await screen.findByRole("combobox", { name: /Campo objetivo/ });
    await waitFor(() => expect(within(target).getAllByTestId("target-suggested")).toHaveLength(1));
    expect(within(target).getByTestId("target-suggested")).toHaveTextContent(
      "marcacion_final · etiqueta del esquema",
    );
    await user.selectOptions(target, "channel");
    expect(await screen.findByTestId("target-not-label")).toHaveTextContent("esquema activo (v7)");
    await user.selectOptions(target, "marcacion_final");
    expect(screen.queryByTestId("target-not-label")).toBeNull();
  });

  it("la revisión muestra el contrato y bloquea el entrenamiento ante una fuga", async () => {
    draft([recipe("monto", "channel"), recipe("fuga", "marcacion_final")], {
      schemaVersion: 6,
      confirmed: true,
    });
    renderWizard();
    expect(await screen.findByTestId("contract-count")).toHaveTextContent(
      "2 variables de entrada activas",
    );
    expect(screen.getAllByTestId("contract-variable")).toHaveLength(2);
    expect(screen.getAllByText("Categorizar").length).toBe(2);
    expect(screen.getByTestId("contract-schema-version")).toHaveTextContent("Esquema v6");
    expect(await screen.findByTestId("contract-schema-outdated")).toHaveTextContent(
      "vigente es v7",
    );
    expect(screen.getByTestId("contract-leaks")).toHaveTextContent(
      "“fuga” depende de “marcacion_final”",
    );
    const alert = screen
      .getAllByRole("alert")
      .find((e) => e.textContent?.includes("No se puede entrenar"));
    expect(alert).toHaveTextContent("Fuga de datos: la variable “fuga”");
    expect(screen.getByRole("button", { name: "Guardar y entrenar" })).toBeDisabled();
  });

  it("un borrador antiguo sin versión de esquema se carga y adopta la vigente", async () => {
    draft([recipe("monto", "channel")]);
    renderWizard();
    expect(await screen.findByTestId("contract-count")).toHaveTextContent(
      "1 variable de entrada activa",
    );
    await waitFor(() =>
      expect(screen.getByTestId("contract-schema-version")).toHaveTextContent("Esquema v7"),
    );
    expect(screen.queryByTestId("contract-leaks")).toBeNull();
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("aria.model-training.draft.v1")!).schemaVersion).toBe(
        7,
      ),
    );
  });

  it("explica en el paso 1 qué falta para continuar", async () => {
    const user = userEvent.setup();
    renderWizard();
    const hint = await screen.findByTestId("wizard-step0-hint");
    expect(hint).toHaveTextContent("Falta: nombre del modelo, dataset.");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await user.type(screen.getByPlaceholderText("xgboost-historico-v1"), "modelo-a");
    expect(screen.getByTestId("wizard-step0-hint")).toHaveTextContent("Falta: dataset.");
    await screen.findByRole("option", { name: /ds1/ });
    await user.selectOptions(screen.getByDisplayValue("Selecciona un dataset"), "ds1");
    await waitFor(() =>
      expect(screen.getByTestId("wizard-step0-hint")).toHaveTextContent("Falta: campo objetivo."),
    );
    await user.selectOptions(
      await screen.findByRole("combobox", { name: /Campo objetivo/ }),
      "marcacion_final",
    );
    await waitFor(() =>
      expect(screen.getByTestId("wizard-step0-hint")).toHaveTextContent("Falta: clase positiva."),
    );
    await user.click(await screen.findByRole("checkbox", { name: /risk/ }));
    await waitFor(() => expect(screen.queryByTestId("wizard-step0-hint")).toBeNull());
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
  });

  it("la revisión lista las variables sospechosas sin bloquear y bloquea los identificadores del esquema", async () => {
    draft(
      [
        recipe("evento", "eventid"),
        recipe("revision", "reviewstatus_first"),
        recipe("monto", "channel"),
      ],
      { confirmed: true, schemaVersion: 7 },
    );
    renderWizard();
    const suspects = await screen.findByTestId("contract-suspects");
    expect(suspects).toHaveTextContent("Revisa estas variables");
    expect(suspects).toHaveTextContent("“evento” usa “eventid”");
    expect(suspects).toHaveTextContent("después de decidir");
    expect(suspects).not.toHaveTextContent("monto");
    expect(screen.queryByTestId("contract-leaks")).toBeNull();
  });

  it("un identificador marcado en el esquema bloquea con el motivo correcto", async () => {
    draft([recipe("llave", "customer_key")], { confirmed: true, schemaVersion: 7 });
    renderWizard();
    const leaks = await screen.findByTestId("contract-leaks");
    expect(leaks).toHaveTextContent("Identificador:");
    expect(leaks).toHaveTextContent("identificador");
    expect(screen.queryByTestId("contract-suspects")).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar y entrenar" })).toBeDisabled();
  });

  it("la creación del modelo envía la versión del esquema usada", async () => {
    const user = userEvent.setup();
    draft([], {
      step: "2",
      schemaVersion: 7,
      features: [{ field: "channel", kind: "categorical", reference_field: null, top_n: 10 }],
    });
    renderWizard();
    await user.click(await screen.findByRole("checkbox", { name: /Confirmo que las fechas/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    const button = await screen.findByRole("button", { name: "Guardar borrador" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(createModel).toHaveBeenCalled());
    expect(createModel.mock.calls[0][0].data.alert_schema_version).toBe(7);
  });
});
