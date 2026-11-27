import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureRecipeWorkspace } from "@/components/modelos/FeatureRecipeWorkspace";
import type { AlertSchemaField, AlertSchemaVersion } from "@/lib/api/alertSchema.functions";
import type { FeatureConfiguration, Recipe } from "@/lib/api/feature-recipes.functions";

const api = vi.hoisted(() => ({
  previewFeatures: vi.fn(),
  getPreviewFeatures: vi.fn(),
}));

vi.mock("@/lib/api/datasets.functions", () => ({
  getDatasetRows: vi.fn().mockResolvedValue({ rows: [] }),
}));
vi.mock("@/lib/api/feature-recipes.functions", () => ({
  previewFeatures: api.previewFeatures,
  getPreviewFeatures: api.getPreviewFeatures,
  parseConfiguration: vi.fn((text: string) => JSON.parse(text)),
  getFeatureTemplates: vi.fn().mockResolvedValue([]),
  getFeatureCapabilities: vi.fn().mockResolvedValue({
    operations: [
      { id: "number", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
      { id: "count", consumes: "array", produces: "scalar", skips_on_missing_input: false },
    ],
    output_types: ["number", "string", "boolean"],
  }),
  saveFeatureTemplate: vi.fn(),
  deleteFeatureTemplate: vi.fn(),
}));

const field = (over: Partial<AlertSchemaField>): AlertSchemaField => ({
  id: over.field ?? "x",
  data_source: "aric",
  field: "x",
  field_name: over.field ?? "x",
  field_ds_loc: over.field ?? "x",
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
});

const schema: AlertSchemaVersion = {
  version: 7,
  status: "active",
  field_roles: {},
  proposed_by: null,
  proposed_at: null,
  approved_by: null,
  approved_at: null,
  impact_acknowledged: false,
  based_on_version: null,
  comparison: {},
  impact: [],
  fields: [
    field({ field: "amount", type: "number" }),
    field({ field: "is_new_device", type: "bool" }),
    field({ field: "channel", type: "string" }),
    field({ field: "created_at", type: "datetime" }),
    field({ field: "tags", type: "list" }),
    field({
      field: "phone_number",
      type: "string",
      is_sensible: true,
      sensitivity_strategy: "hash",
    }),
    field({ field: "is_fraud", type: "bool", is_alert: false, is_label: true }),
    field({ field: "aria_score", type: "number", data_source: "aria", is_alert: false }),
    field({ field: "tx_history", type: "list", is_alert: false, is_history: true }),
  ],
};

const recipe = (over: Partial<Recipe>): Recipe => ({
  id: over.name ?? "r1",
  name: "v1",
  description: "",
  enabled: true,
  output_type: "number",
  source: "current",
  path: "amount",
  missing: { policy: "missing" },
  steps: [],
  ...over,
});

const config = (recipes: Recipe[], schema_version: 1 | 2 = 2): FeatureConfiguration => ({
  schema_version,
  mappings: { timezone: "America/Bogota", history: "tx_history" },
  recipes,
});

// Mirrors what the real review found: identifiers and post-decision fields by
// name, plus hard rules marked in the schema.
const riskySchema: AlertSchemaVersion = {
  ...schema,
  version: 78,
  fields: [
    field({ field: "amount", type: "number" }),
    field({ field: "channel", type: "string" }),
    field({ field: "eventid", type: "string" }),
    field({ field: "session_sessionId", type: "string" }),
    field({ field: "reviewstatus_first", type: "string" }),
    field({ field: "fecha_primer_marcacion_hora", type: "datetime" }),
    field({ field: "customer_hash", type: "string", is_identifier: true }),
    field({ field: "closed_at", type: "datetime", available_at_decision: false }),
    field({
      field: "phone_number",
      type: "string",
      is_sensible: true,
      sensitivity_strategy: "hash",
    }),
    field({ field: "marcacion_final", type: "string", is_alert: false, is_label: true }),
    field({ field: "aria_score", type: "number", data_source: "aria", is_alert: false }),
    field({ field: "tx_history", type: "list", is_alert: false, is_history: true }),
  ],
};

let latest: FeatureConfiguration;
function Harness({
  initial,
  withSchema = true,
  availableFields = [],
  schemaValue = schema,
  target = "",
  inWizard = false,
}: {
  initial: FeatureConfiguration;
  withSchema?: boolean;
  availableFields?: string[];
  schemaValue?: AlertSchemaVersion;
  target?: string;
  inWizard?: boolean;
}) {
  const [value, setValue] = useState(initial);
  latest = value;
  return (
    <FeatureRecipeWorkspace
      value={value}
      onChange={setValue}
      dataset=""
      target={target}
      showHistorySettings={!inWizard}
      availableFields={availableFields}
      onValidity={() => {}}
      schema={withSchema ? schemaValue : null}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("feature workspace — banner and menu", () => {
  it("shows a neutral banner with the real versions", () => {
    render(<Harness initial={config([recipe({})], 2)} />);
    const banner = screen.getByTestId("fe-active-banner");
    expect(banner).toHaveTextContent("Variables activas: 1");
    expect(banner).toHaveTextContent("versión 2");
    expect(banner).toHaveTextContent("esquema v7");
    expect(banner).not.toHaveTextContent("versión 1");
    expect(screen.queryByText(/Mapeos activos/)).toBeNull();
  });

  it("moves test/JSON/templates into a secondary menu without losing them", async () => {
    const user = userEvent.setup();
    render(<Harness initial={config([recipe({})])} />);
    expect(screen.queryByRole("button", { name: "Prueba de configuración" })).toBeNull();
    expect(screen.queryByText("Plantillas reutilizables")).toBeNull();
    await user.click(screen.getByTestId("fe-menu-button"));
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["JSON avanzado", "Plantillas", "Descargar JSON", "Probar con más filas"]);
    await user.click(screen.getByTestId("fe-menu-json"));
    expect(screen.getByLabelText("Configuración JSON")).toBeInTheDocument();
    await user.click(screen.getByTestId("fe-back-to-variables"));
    await user.click(screen.getByTestId("fe-menu-button"));
    await user.click(screen.getByTestId("fe-menu-templates"));
    expect(screen.getByLabelText("Nombre de plantilla")).toBeInTheDocument();
    await user.click(screen.getByTestId("fe-back-to-variables"));
    await user.click(screen.getByTestId("fe-menu-button"));
    await user.click(screen.getByTestId("fe-menu-preview"));
    expect(screen.getByRole("button", { name: /Validar y calcular/ })).toBeInTheDocument();
  });
});

describe("feature workspace — schema fed selector and inherited rules", () => {
  it("offers schema fields by role with their type and never the label or ARIA result", () => {
    render(<Harness initial={config([recipe({})])} />);
    const select = screen.getByTestId("fe-field-picker-select") as HTMLSelectElement;
    const options = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent ?? "");
    expect(options.some((o) => o.includes("amount") && o.includes("número"))).toBe(true);
    expect(options.some((o) => o.includes("created_at") && o.includes("fecha y hora"))).toBe(true);
    expect(options.some((o) => o.includes("phone_number") && o.includes("sensible"))).toBe(true);
    expect(options.some((o) => o.includes("is_fraud"))).toBe(false);
    expect(options.some((o) => o.includes("aria_score"))).toBe(false);
    expect(select.querySelector("optgroup")?.getAttribute("label")).toBe("Dato de la alerta");
    const excluded = screen.getByTestId("fe-excluded-fields");
    expect(within(excluded).getByTestId("fe-excluded-is_fraud")).toHaveTextContent("etiqueta");
    expect(within(excluded).getByTestId("fe-excluded-aria_score")).toHaveTextContent("ARIA");
  });

  it("offers 'Proponer al esquema' for a path the schema does not know", async () => {
    const user = userEvent.setup();
    render(<Harness initial={config([recipe({ path: "raw.unknown_field" })])} />);
    expect(screen.getByTestId("fe-field-picker-free")).toHaveValue("raw.unknown_field");
    expect(screen.getByTestId("fe-propose-schema")).toHaveTextContent("Proponer al esquema");
    await user.selectOptions(screen.getByTestId("fe-field-picker-select"), "amount");
    expect(latest.recipes[0].path).toBe("amount");
    expect(screen.queryByTestId("fe-propose-schema")).toBeNull();
  });

  it("warns on sensitive fields and flags excluded ones", () => {
    render(
      <Harness
        initial={config([
          recipe({ id: "s", name: "doc", path: "phone_number", output_type: "string" }),
          recipe({ id: "l", name: "leak", path: "is_fraud", output_type: "boolean" }),
        ])}
      />,
    );
    expect(screen.getByTestId("fe-sensitive-warning")).toHaveTextContent("Dato sensible (hash)");
    // Nothing was validated yet: neutral, never a green check.
    expect(screen.getByTestId("fe-validity-doc")).toHaveAttribute("data-state", "unvalidated");
    expect(screen.getByTestId("fe-validity-doc")).not.toHaveTextContent("✓");
    expect(screen.getByTestId("fe-validity-leak")).toHaveTextContent("⚠");
    return userEventSelect("leak");
  });

  async function userEventSelect(name: string) {
    const user = userEvent.setup();
    await user.click(screen.getByTestId(`fe-variable-item-${name}`));
    expect(screen.getByTestId("fe-excluded-in-use")).toHaveTextContent("etiqueta");
    expect(screen.queryByTestId("fe-sensitive-warning")).toBeNull();
  }
});

describe("feature workspace — list grouping and generation", () => {
  it("groups variables by origin", () => {
    render(
      <Harness
        initial={config([
          recipe({ id: "a", name: "monto" }),
          recipe({
            id: "b",
            name: "n_tx",
            source: "history",
            path: undefined,
            steps: [{ id: "s", operation: "count" }],
          }),
        ])}
      />,
    );
    expect(
      within(screen.getByTestId("fe-group-current")).getByTestId("fe-variable-item-monto"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("fe-group-history")).getByTestId("fe-variable-item-n_tx"),
    ).toBeInTheDocument();
  });

  it("opens a review and creates variables by schema type, never label, ARIA result or history", async () => {
    const user = userEvent.setup();
    render(<Harness initial={config([])} />);
    expect(latest.recipes).toHaveLength(0);
    await user.click(screen.getByTestId("fe-generate"));
    expect(screen.getByTestId("fe-generate-review")).toBeInTheDocument();
    // Opening the review creates nothing.
    expect(latest.recipes).toHaveLength(0);
    // is_fraud / aria_score are listed but cannot be marked.
    expect(screen.getByTestId("fe-gen-check-is_fraud")).toBeDisabled();
    expect(screen.getByTestId("fe-gen-check-aria_score")).toBeDisabled();
    expect(screen.getByTestId("fe-gen-confirm")).toHaveTextContent("Crear 7 variables");
    await user.click(screen.getByTestId("fe-gen-confirm"));
    const byName = Object.fromEntries(latest.recipes.map((r) => [r.name, r]));
    expect(byName.amount).toMatchObject({ output_type: "number", steps: [] });
    expect(byName.is_new_device).toMatchObject({ output_type: "boolean" });
    expect(byName.is_new_device.steps.map((s) => s.operation)).toEqual(["to_boolean"]);
    expect(byName.channel).toMatchObject({ output_type: "string", steps: [] });
    expect(byName.created_at_hora.steps.map((s) => s.operation)).toEqual(["hour"]);
    expect(byName.created_at_dia_semana.steps.map((s) => s.operation)).toEqual(["weekday"]);
    expect(byName.tags_conteo.steps.map((s) => s.operation)).toEqual(["count"]);
    expect(Object.keys(byName).some((n) => /is_fraud|aria_score|tx_history/.test(n))).toBe(false);
    // Idempotent: nothing proposable is left, so it cannot duplicate.
    const count = latest.recipes.length;
    expect(screen.getByTestId("fe-generate")).toBeDisabled();
    expect(latest.recipes).toHaveLength(count);
  });

  it("leaves identifiers, post-decision and hard-excluded fields unmarked with their reason", async () => {
    const user = userEvent.setup();
    render(<Harness schemaValue={riskySchema} target="marcacion_final" initial={config([])} />);
    await user.click(screen.getByTestId("fe-generate"));
    const unmarked = [
      "eventid",
      "session_sessionId",
      "reviewstatus_first",
      "fecha_primer_marcacion_hora",
      "customer_hash",
      "closed_at",
      "marcacion_final",
      "aria_score",
    ];
    for (const name of unmarked) {
      expect(screen.getByTestId(`fe-gen-check-${name}`), name).not.toBeChecked();
      expect(screen.getByTestId(`fe-gen-reason-${name}`), name).not.toBeEmptyDOMElement();
    }
    expect(screen.getByTestId("fe-gen-reason-eventid")).toHaveTextContent("identificador");
    expect(screen.getByTestId("fe-gen-reason-reviewstatus_first")).toHaveTextContent(
      "después de decidir",
    );
    expect(screen.getByTestId("fe-gen-reason-customer_hash")).toHaveTextContent("esquema");
    // Hard rules cannot be marked; name heuristics can, explicitly.
    for (const name of ["customer_hash", "closed_at", "marcacion_final", "aria_score"]) {
      expect(screen.getByTestId(`fe-gen-check-${name}`)).toBeDisabled();
      expect(screen.queryByTestId(`fe-gen-force-${name}`)).toBeNull();
    }
    expect(screen.getByTestId("fe-gen-section-suspect")).toContainElement(
      screen.getByTestId("fe-gen-item-eventid"),
    );
    // Marked: normal fields and the sensitive one (with a warning).
    expect(screen.getByTestId("fe-gen-check-amount")).toBeChecked();
    expect(screen.getByTestId("fe-gen-check-channel")).toBeChecked();
    expect(screen.getByTestId("fe-gen-check-phone_number")).toBeChecked();
    expect(screen.getByTestId("fe-gen-reason-phone_number")).toHaveTextContent("Aviso");
    expect(screen.getByTestId("fe-gen-confirm")).toHaveTextContent("Crear 3 variables");
    await user.click(screen.getByTestId("fe-gen-confirm"));
    expect(latest.recipes.map((r) => r.name).sort()).toEqual(["amount", "channel", "phone_number"]);
    for (const row of ["amount", "channel", "phone_number"])
      expect(screen.getByTestId(`fe-validity-${row}`)).toHaveAttribute("data-state", "unvalidated");
  });

  it("includes a suspect only after an explicit 'Incluir de todos modos'", async () => {
    const user = userEvent.setup();
    render(<Harness schemaValue={riskySchema} initial={config([])} />);
    await user.click(screen.getByTestId("fe-generate"));
    await user.click(screen.getByTestId("fe-gen-force-eventid"));
    expect(screen.getByTestId("fe-gen-check-eventid")).toBeChecked();
    expect(screen.getByTestId("fe-gen-confirm")).toHaveTextContent("Crear 4 variables");
    await user.click(screen.getByTestId("fe-gen-confirm"));
    expect(latest.recipes.map((r) => r.name)).toContain("eventid");
    expect(latest.recipes.map((r) => r.name)).not.toContain("reviewstatus_first");
    // The forced suspect shows ⚠ and its reason instead of a green check.
    const item = screen.getByTestId("fe-validity-eventid");
    expect(item).toHaveAttribute("data-state", "warning");
    expect(item).toHaveAttribute("aria-label", expect.stringContaining("sospechoso"));
  });

  it("creates only what remains marked and nothing on cancel", async () => {
    const user = userEvent.setup();
    render(<Harness schemaValue={riskySchema} initial={config([])} />);
    await user.click(screen.getByTestId("fe-generate"));
    await user.click(screen.getByTestId("fe-gen-check-channel"));
    expect(screen.getByTestId("fe-gen-confirm")).toHaveTextContent("Crear 2 variables");
    await user.click(screen.getByTestId("fe-gen-cancel"));
    expect(screen.queryByTestId("fe-generate-review")).toBeNull();
    expect(latest.recipes).toHaveLength(0);
    await user.click(screen.getByTestId("fe-generate"));
    expect(screen.getByTestId("fe-gen-check-channel")).toBeChecked();
    await user.click(screen.getByTestId("fe-gen-check-channel"));
    await user.click(screen.getByTestId("fe-gen-confirm"));
    expect(latest.recipes.map((r) => r.name).sort()).toEqual(["amount", "phone_number"]);
  });

  it("shows the reason in the field picker when the chosen field is suspect or excluded", () => {
    render(
      <Harness
        schemaValue={riskySchema}
        initial={config([
          recipe({ id: "a", name: "ev", path: "eventid", output_type: "string" }),
          recipe({ id: "b", name: "lab", path: "marcacion_final", output_type: "string" }),
        ])}
      />,
    );
    expect(screen.getByTestId("fe-field-guard")).toHaveAttribute("data-level", "suspect");
    expect(screen.getByTestId("fe-field-guard")).toHaveTextContent("identificador");
    expect(screen.getByTestId("fe-validity-ev")).toHaveAttribute("data-state", "warning");
    expect(screen.getByTestId("fe-validity-lab")).toHaveAttribute("data-state", "warning");
  });

  it("marks a variable ✓ only after the evaluator computed it", async () => {
    const user = userEvent.setup();
    api.previewFeatures.mockResolvedValue({ task_id: "t1", status: "PENDING" });
    api.getPreviewFeatures.mockResolvedValue({
      task_id: "t1",
      status: "READY",
      result: {
        rows: [
          {
            values: { v1: 42 },
            features: [{ id: "r1", name: "v1", status: "ok", value: 42, trace: [] }],
          },
        ],
      },
    });
    render(<Harness initial={config([recipe({})])} />);
    expect(screen.getByTestId("fe-validity-v1")).toHaveAttribute("data-state", "unvalidated");
    await user.click(screen.getByTestId("fe-inline-run"));
    await waitFor(() =>
      expect(screen.getByTestId("fe-validity-v1")).toHaveAttribute("data-state", "valid"),
    );
    expect(screen.getByTestId("fe-validity-v1")).toHaveTextContent("✓");
    await act(async () => {});
  });

  it("marks ⚠ when the evaluator reports an error for the variable", async () => {
    const user = userEvent.setup();
    api.previewFeatures.mockResolvedValue({ task_id: "t1", status: "PENDING" });
    api.getPreviewFeatures.mockResolvedValue({
      task_id: "t1",
      status: "READY",
      result: {
        rows: [
          {
            values: {},
            features: [{ id: "r1", name: "v1", status: "error", value: null, trace: [] }],
          },
        ],
      },
    });
    render(<Harness initial={config([recipe({})])} />);
    await user.click(screen.getByTestId("fe-inline-run"));
    await waitFor(() =>
      expect(screen.getByTestId("fe-validity-v1")).toHaveAttribute("data-state", "warning"),
    );
    await act(async () => {});
  });

  it("does not offer the review beyond the 200 variable limit", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      recipe({ id: `m${i}`, name: `m${i}`, path: `p${i}` }),
    );
    render(<Harness initial={config(many)} />);
    expect(screen.getByTestId("fe-generate")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("límite de 200");
  });

  it("blocks 'Crear' when the marked fields would exceed 200", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 198 }, (_, i) =>
      recipe({ id: `m${i}`, name: `m${i}`, path: `p${i}` }),
    );
    render(<Harness initial={config(many)} />);
    await user.click(screen.getByTestId("fe-generate"));
    expect(screen.getByTestId("fe-gen-limit")).toHaveTextContent("límite de 200");
    expect(screen.getByTestId("fe-gen-confirm")).toBeDisabled();
    await user.click(screen.getByTestId("fe-gen-check-channel"));
    await user.click(screen.getByTestId("fe-gen-check-tags"));
    expect(screen.getByTestId("fe-gen-confirm")).toBeDisabled();
  });

  it("explains where the history is defined in the empty state", () => {
    render(
      <Harness inWizard initial={{ ...config([]), mappings: { timezone: "America/Bogota" } }} />,
    );
    expect(screen.getByTestId("fe-empty-state")).toHaveTextContent("Datos y objetivo");
    expect(screen.getByTestId("fe-empty-state")).not.toHaveTextContent("selecciona primero");
  });

  it("only offers the history starters when a history is configured", () => {
    const { unmount } = render(<Harness initial={config([])} />);
    expect(screen.getByTestId("fe-empty-state")).toHaveTextContent("ya está configurado");
    expect(screen.getByTestId("fe-add-ratio")).toBeInTheDocument();
    unmount();
    render(<Harness initial={{ ...config([]), mappings: { timezone: "America/Bogota" } }} />);
    expect(screen.queryByTestId("fe-add-ratio")).toBeNull();
    expect(screen.queryByText("+ Categoría de importe")).toBeNull();
  });
});

describe("feature workspace — without schema", () => {
  it("keeps free paths and the dataset-based generation as text", async () => {
    const user = userEvent.setup();
    render(
      <Harness withSchema={false} availableFields={["amount", "channel"]} initial={config([])} />,
    );
    expect(screen.queryByTestId("fe-active-banner")).toHaveTextContent("versión 2");
    expect(screen.getByTestId("fe-active-banner")).not.toHaveTextContent("esquema v");
    await user.click(screen.getByTestId("fe-generate"));
    await user.click(screen.getByTestId("fe-gen-confirm"));
    expect(latest.recipes.map((r) => [r.name, r.output_type, r.steps.length])).toEqual([
      ["amount", "string", 0],
      ["channel", "string", 0],
    ]);
    expect(screen.getByLabelText("Campo de la alerta")).toHaveAttribute("list", "fe-paths");
    expect(screen.queryByTestId("fe-field-picker-select")).toBeNull();
  });
});

describe("feature workspace — without schema, name heuristic", () => {
  it("leaves dataset columns that look like identifiers or post-decision unmarked", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        withSchema={false}
        target="marcacion_final"
        availableFields={["amount", "eventid", "reviewstatus_first", "marcacion_final"]}
        initial={config([])}
      />,
    );
    await user.click(screen.getByTestId("fe-generate"));
    expect(screen.getByTestId("fe-gen-check-amount")).toBeChecked();
    expect(screen.getByTestId("fe-gen-check-eventid")).not.toBeChecked();
    expect(screen.getByTestId("fe-gen-reason-reviewstatus_first")).toHaveTextContent(
      "después de decidir",
    );
    expect(screen.getByTestId("fe-gen-check-marcacion_final")).toBeDisabled();
    expect(screen.getByTestId("fe-gen-reason-marcacion_final")).toHaveTextContent("objetivo");
    await user.click(screen.getByTestId("fe-gen-confirm"));
    expect(latest.recipes.map((r) => r.name)).toEqual(["amount"]);
  });
});

describe("feature workspace — embedded test", () => {
  it("shows example → result per step and an always visible final value", async () => {
    const user = userEvent.setup();
    api.previewFeatures.mockResolvedValue({ task_id: "t1", status: "PENDING" });
    api.getPreviewFeatures.mockResolvedValue({
      task_id: "t1",
      status: "READY",
      result: {
        rows: [
          {
            values: { v1: 42 },
            features: [
              {
                id: "r1",
                name: "v1",
                status: "ok",
                value: 42,
                trace: [{ operation: "number", value: 42 }],
              },
            ],
          },
        ],
      },
    });
    render(<Harness initial={config([recipe({ steps: [{ id: "s1", operation: "number" }] })])} />);
    expect(screen.getByTestId("fe-inline-final")).toHaveTextContent("Sin probar");
    await user.click(screen.getByTestId("fe-inline-run"));
    await waitFor(() => expect(screen.getByTestId("fe-inline-final")).toHaveTextContent("42"));
    expect(api.previewFeatures).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("fe-step-result-0")).toHaveTextContent("→ 42");
    await act(async () => {});
  });
});
