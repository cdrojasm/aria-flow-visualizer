import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertSchemaEditor } from "@/components/configuracion/schema/AlertSchemaEditor";
import { distributionText } from "@/components/configuracion/schema/EssentialFieldsChecklist";
import { humanError, summarizeComparison } from "@/components/configuracion/schema/schemaHelpers";

const field = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  data_source: "aric",
  field: id,
  field_name: id,
  field_ds_loc: `payload.${id}`,
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

const base = {
  proposed_by: null,
  proposed_at: null,
  approved_by: null,
  approved_at: null,
  impact_acknowledged: false,
  based_on_version: null,
  comparison: {},
  impact: [],
};
const activeSchema = {
  ...base,
  version: 3,
  status: "active",
  fields: [
    field("event-id"),
    field("event_time", { type: "datetime" }),
    field("event_type"),
    field("channel"),
    field("entrypoint"),
    field("customer_id"),
    field("monto", { type: "number" }),
    field("marca", { is_label: true, is_alert: false }),
    field("pii", { is_sensible: true }),
  ],
  field_roles: {
    event_id: "event-id",
    event_time: "event_time",
    event_type: "event_type",
    channel: "channel",
    entrypoint: "entrypoint",
    customer_id: "customer_id",
    amount: "monto",
  },
};
const proposed = {
  ...base,
  version: 4,
  status: "proposed",
  proposed_by: "other",
  fields: activeSchema.fields,
  field_roles: activeSchema.field_roles,
  comparison: {
    added: [{ id: "x", field: "nuevo" }],
    removed: [],
    changed: [
      {
        field_id: "monto",
        field: "monto",
        attributes: { type: { before: "string", after: "number" } },
      },
    ],
    role_reassignments: [],
  },
  impact: [{ kind: "configuration", id: "c1", version: 7 }],
};

const api = vi.hoisted(() => ({
  active: null as unknown,
  versions: [] as unknown[],
  save: vi.fn(),
  approve: vi.fn(),
  usage: null as unknown,
}));
const user = vi.hoisted(() => ({ id: "me" }));
vi.mock("@/hooks/useRole", () => ({ useRole: () => ({ user, role: "manager" }) }));
vi.mock("@/lib/api/alertSchema.functions", () => ({
  getActiveAlertSchema: () => Promise.resolve(api.active),
  listAlertSchemaVersions: () => Promise.resolve(api.versions),
  getAlertSchemaUsage: () =>
    api.usage ? Promise.resolve(api.usage) : Promise.reject(new Error("sin endpoint")),
  listAlertSchemaSuggestions: () =>
    Promise.resolve([
      {
        id: "s1",
        alert_id: "a1",
        field: "canal_raro",
        location: "payload.canal_raro",
        comment: "falta este campo",
        created_by: "analyst",
        created_at: "",
      },
    ]),
  getAlertSchemaPresence: () =>
    Promise.resolve({
      report_day: "2026-11-25",
      generated_at: "",
      schema_version: 3,
      alert_count: 10,
      fields: [],
      unknown_locations: [
        { location: "payload.nuevo_a", frequency: 4 },
        { location: "payload.canal_raro", frequency: 2 },
      ],
    }),
  saveAlertSchemaDraft: (args: unknown) => api.save(args),
  proposeAlertSchema: vi.fn(),
  approveAlertSchema: (args: unknown) => api.approve(args),
  rejectAlertSchema: vi.fn(),
}));

function renderEditor() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AlertSchemaEditor />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.active = activeSchema;
  api.versions = [activeSchema, proposed];
  api.save.mockReset();
  api.approve.mockReset();
  api.usage = null;
  user.id = "me";
});

describe("helpers", () => {
  it("humaniza errores sin código HTTP", () => {
    expect(humanError(new Error('/api/v0/x -> 409: {"detail":"x"}'))).not.toMatch(/409/);
    expect(humanError(new Error('/api/v0/x -> 422: {"detail":"Campo duplicado"}'))).toBe(
      "El esquema no cumple las validaciones: Campo duplicado",
    );
    expect(humanError(new Error("/api/v0/x -> 500: boom"))).not.toMatch(/500/);
  });
  it("resume la comparación y degrada si la forma es desconocida", () => {
    expect(summarizeComparison({ foo: 1 })).toBeNull();
    const summary = summarizeComparison(proposed.comparison);
    expect(summary).toMatchObject({ added: 1, removed: 0, typeOrRole: 1, total: 2 });
    expect(summarizeComparison({})?.total).toBe(0);
  });
});

describe("pestaña Esquema", () => {
  it("muestra la banda de estado y estados en español", async () => {
    renderEditor();
    const band = await screen.findByTestId("schema-status-band");
    expect(await within(band).findByText(/Activa v3/)).toBeInTheDocument();
    expect(band).toHaveTextContent("Esenciales: 7/7 obligatorios ✓");
    expect(band).toHaveTextContent("Opcionales: 0/2");
    expect(band).toHaveTextContent("Sensibles sin estrategia: 1");
    expect(band).toHaveTextContent("Por revisar: 2");
    expect(screen.getByTestId("schema-chip-essentials")).toHaveAttribute("data-tone", "ok");
    expect(screen.getByTestId("schema-chip-review")).toHaveAttribute("data-tone", "neutral");
    expect(screen.getByTestId("schema-chip-sensitive")).toHaveAttribute("data-tone", "bad");
    expect(within(band).getByRole("button", { name: "Editar borrador" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "v4 · En revisión" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(proposed|historical)\b/);
  });

  it("flujo del botón primario: editar, guardar con error humano, proponer", async () => {
    const u = userEvent.setup();
    renderEditor();
    await u.click(await screen.findByRole("button", { name: "Editar borrador" }));
    const band = screen.getByTestId("schema-status-band");
    expect(band).toHaveTextContent("Borrador con 0 cambios");
    expect(screen.getByTestId("schema-primary-action")).toHaveTextContent("Guardar borrador");
    await u.click(screen.getByRole("button", { name: "Campos", exact: true } as never));
    await u.type(screen.getByRole("textbox", { name: "Nombre monto" }), "!");
    expect(band).toHaveTextContent("Borrador con 1 cambio");
    // La validación aparece junto a la banda y bloquea guardar.
    expect(screen.getByTestId("schema-validation-errors")).toHaveTextContent(
      "pii: define la estrategia sensible",
    );
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Detalles pii" }));
    await u.selectOptions(
      within(await screen.findByTestId("side-drawer")).getByLabelText("Estrategia sensible pii"),
      "anonymize",
    );
    await u.keyboard("{Escape}");
    expect(screen.queryByTestId("schema-validation-errors")).toBeNull();
    api.save.mockRejectedValueOnce(new Error("/api/v0/alert-schema/drafts -> 409: {}"));
    await u.click(screen.getByRole("button", { name: "Guardar borrador" }));
    const alert = await screen.findByTestId("schema-action-error");
    expect(alert).not.toHaveTextContent("409");
    expect(alert).toHaveTextContent("versión activa cambió");
  });

  it("el rol único hace imposible etiqueta e historial", async () => {
    const u = userEvent.setup();
    renderEditor();
    await u.click(await screen.findByRole("button", { name: "Editar borrador" }));
    await u.click(screen.getByRole("button", { name: "Campos" }));
    const role = screen.getByRole("combobox", { name: "Rol marca" }) as HTMLSelectElement;
    expect(role.value).toBe("label");
    expect(screen.queryByRole("checkbox", { name: /Etiqueta|Historial/ })).toBeNull();
    await u.selectOptions(role, "history");
    expect((screen.getByRole("combobox", { name: "Rol marca" }) as HTMLSelectElement).value).toBe(
      "history",
    );
    expect(screen.queryByText(/etiqueta e historial/)).toBeNull();
  });

  it("abre el panel lateral con los detalles del campo", async () => {
    const u = userEvent.setup();
    renderEditor();
    await u.click(await screen.findByRole("button", { name: "Campos" }));
    // Sin borrador: texto plano, no controles editables.
    expect(screen.queryByRole("textbox", { name: "Campo monto" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Rol monto" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Tipo monto" })).toBeNull();
    expect(screen.getByTestId("field-text-monto")).toHaveTextContent("monto");
    expect(screen.queryByLabelText("Descripción monto")).toBeNull();
    await u.click(await screen.findByRole("button", { name: "Detalles monto" }));
    const drawer = await screen.findByTestId("side-drawer");
    expect(within(drawer).getByLabelText("Descripción monto")).toBeDisabled();
    expect(within(drawer).getByLabelText("Ubicación monto")).toHaveValue("payload.monto");
    expect(screen.getByTestId("chips-pii")).toHaveTextContent("Sensible sin estrategia");
  });

  it("checklist de esenciales y bandeja por revisar unificada", async () => {
    const u = userEvent.setup();
    renderEditor();
    const checklist = await screen.findByTestId("essential-fields");
    expect(await within(checklist).findAllByRole("img", { name: "Cubierto" })).toHaveLength(7);
    expect(screen.getByRole("combobox", { name: "Campo para amount" })).toHaveValue("monto");
    await u.click(screen.getByRole("button", { name: "Por revisar (2)" }));
    const items = await screen.findAllByTestId("review-item");
    expect(items).toHaveLength(2);
    expect(screen.getByText("canal_raro · payload.canal_raro")).toBeInTheDocument();
    await u.click(within(items[0]).getByRole("button", { name: "Ignorar" }));
    expect(screen.getByRole("button", { name: "Por revisar (1)" })).toBeInTheDocument();
  });

  it("muestra el diff legible y el impacto antes de aprobar", async () => {
    const u = userEvent.setup();
    renderEditor();
    await screen.findByRole("option", { name: /v4/ });
    await u.selectOptions(
      await screen.findByRole("combobox", { name: "Versión del esquema" }),
      "4",
    );
    const primary = await screen.findByRole("button", { name: "Aprobar propuesta" });
    expect(primary).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Propuestas" }));
    const chips = await screen.findByTestId("schema-diff-chips");
    expect(chips).toHaveTextContent("+1 añadidos");
    expect(chips).toHaveTextContent("~1 cambian de tipo/rol");
    expect(chips).toHaveTextContent("−0 eliminados");
    expect(screen.getByText(/tipo: string → number/)).toBeInTheDocument();
    expect(screen.getByText(/Configuración · v7/)).toBeInTheDocument();
    await u.click(screen.getByRole("checkbox", { name: /Entiendo el impacto/ }));
    expect(screen.getByRole("button", { name: "Aprobar propuesta" })).toBeEnabled();
  });
});

describe("revisión visual del Esquema", () => {
  it("cuenta solo obligatorios como esenciales y no alarma por opcionales", async () => {
    api.active = {
      ...activeSchema,
      field_roles: { ...activeSchema.field_roles, customer_id: "" },
    };
    api.versions = [api.active];
    renderEditor();
    await screen.findByText(/Activa v3/);
    const chip = await screen.findByTestId("schema-chip-essentials");
    expect(chip).toHaveTextContent("Esenciales: 6/7 obligatorios");
    expect(chip).not.toHaveTextContent("✓");
    expect(chip).toHaveAttribute("data-tone", "bad");
  });

  it("sensibles sin estrategia en 0 no es alarma", async () => {
    const clean = {
      ...activeSchema,
      fields: activeSchema.fields.filter((item) => item.id !== "pii"),
    };
    api.active = clean;
    api.versions = [clean];
    renderEditor();
    const chip = await screen.findByTestId("schema-chip-sensitive");
    expect(chip).toHaveTextContent("Sensibles sin estrategia: 0");
    expect(chip).toHaveAttribute("data-tone", "ok");
  });

  it("oculta 'Usado por' sin datos de uso y no duplica el título del grupo", async () => {
    const u = userEvent.setup();
    renderEditor();
    await u.click(await screen.findByRole("button", { name: "Campos", exact: true } as never));
    const group = await screen.findByTestId("fields-role-alert");
    expect(within(group).queryByText("Usado por")).toBeNull();
    expect(within(group).getAllByRole("heading", { name: "Dato de la alerta" })).toHaveLength(1);
  });

  it("muestra 'Usado por' si algún campo tiene uso", async () => {
    const withUse = {
      ...activeSchema,
      impact: [{ kind: "configuration", id: "c1", version: 7, fields: ["monto"] }],
    };
    api.active = withUse;
    api.versions = [withUse];
    const u = userEvent.setup();
    renderEditor();
    await u.click(await screen.findByRole("button", { name: "Campos", exact: true } as never));
    const group = await screen.findByTestId("fields-role-alert");
    expect(within(group).getByText("Usado por")).toBeInTheDocument();
    expect(within(group).getByText("Configuración · v7")).toBeInTheDocument();
  });

  it("la columna 'Usado por' sale del endpoint de uso: chips, máx. 2 + N", async () => {
    api.usage = {
      version: 3,
      fields: {
        monto: [
          { kind: "model", name: "xgb-v1", ref: "m1" },
          { kind: "configuration", name: "Config A", ref: "c1" },
          { kind: "model", name: "xgb-v2", ref: "m2" },
        ],
      },
    };
    const u = userEvent.setup();
    renderEditor();
    await u.click(await screen.findByRole("button", { name: "Campos", exact: true } as never));
    const usage = await screen.findByTestId("usage-monto");
    expect(usage).toHaveTextContent("Modelo · xgb-v1");
    expect(usage).toHaveTextContent("Configuración · Config A");
    expect(usage).toHaveTextContent("+1");
    expect(usage).not.toHaveTextContent("xgb-v2");
    expect(screen.queryByTestId("usage-event_type")).toBeNull();
  });

  it("el panel del campo avisa del impacto si tiene consumidores", async () => {
    api.usage = { version: 3, fields: { monto: [{ kind: "model", name: "xgb-v1", ref: "m1" }] } };
    const u = userEvent.setup();
    renderEditor();
    await u.click(await screen.findByRole("button", { name: "Campos", exact: true } as never));
    await u.click(await screen.findByRole("button", { name: "Detalles monto" }));
    expect(await screen.findByTestId("field-usage-warning")).toHaveTextContent(
      "Lo usan: Modelo · xgb-v1",
    );
    await u.click(screen.getByRole("button", { name: /Cerrar|Close/ }));
    await u.click(await screen.findByRole("button", { name: "Detalles marca" }));
    expect(screen.queryByTestId("field-usage-warning")).toBeNull();
  });

  it("recorta la distribución: 3 valores, valores largos con elipsis", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const text = distributionText({
      kind: "categorical",
      frequencies: { [uuid]: 9, a: 5, b: 4, c: 3, d: 1 },
    } as never);
    expect(text).toBe("Valores: 123e4567-e89b-12d3-a456-…: 9 · a: 5 · b: 4 · +2 más");
    expect(text).not.toContain(uuid);
  });

  it("controles y chips de identificador / posterior a la decisión", async () => {
    const flagged = {
      ...activeSchema,
      fields: activeSchema.fields.map((item) =>
        item.id === "customer_id"
          ? { ...item, is_identifier: true }
          : item.id === "monto"
            ? { ...item, available_at_decision: false }
            : item,
      ),
    };
    api.active = flagged;
    api.versions = [flagged];
    const u = userEvent.setup();
    renderEditor();
    await u.click(await screen.findByRole("button", { name: "Editar borrador" }));
    await u.click(screen.getByRole("button", { name: "Campos", exact: true } as never));
    expect(screen.getByTestId("chips-customer_id")).toHaveTextContent("Identificador");
    expect(screen.getByTestId("chips-monto")).toHaveTextContent("Posterior a la decisión");
    expect(screen.getByTestId("chips-event-id")).not.toHaveTextContent("Identificador");
    await u.click(screen.getByRole("button", { name: "Detalles event-id" }));
    const drawer = await screen.findByTestId("side-drawer");
    const ident = within(drawer).getByLabelText("Es un identificador event-id");
    const avail = within(drawer).getByLabelText("Disponible al momento de decidir event-id");
    expect(ident).not.toBeChecked();
    expect(avail).toBeChecked();
    await u.click(ident);
    await u.click(avail);
    await u.keyboard("{Escape}");
    expect(screen.getByTestId("chips-event-id")).toHaveTextContent("Identificador");
    expect(screen.getByTestId("chips-event-id")).toHaveTextContent("Posterior a la decisión");
    expect(screen.getByTestId("schema-status-band")).toHaveTextContent("Borrador con 1 cambio");
  });

  it("valida etiqueta + identificador", async () => {
    const bad = {
      ...activeSchema,
      fields: activeSchema.fields.map((item) =>
        item.id === "marca" ? { ...item, is_identifier: true } : item,
      ),
    };
    api.active = bad;
    api.versions = [bad];
    const u = userEvent.setup();
    renderEditor();
    await u.click(await screen.findByRole("button", { name: "Editar borrador" }));
    expect(await screen.findByTestId("schema-validation-errors")).toHaveTextContent(
      "no puede ser etiqueta e identificador",
    );
  });

  it("un borrador nuevo inicializa las banderas y las envía al guardar", async () => {
    api.active = { ...activeSchema, fields: [], field_roles: {} };
    api.versions = [api.active];
    const u = userEvent.setup();
    renderEditor();
    await u.click(await screen.findByRole("button", { name: "Editar borrador" }));
    await u.click(screen.getByRole("button", { name: "Campos", exact: true } as never));
    await u.click(screen.getByRole("button", { name: "Campo" }));
    const detail = (await screen.findAllByRole("button", { name: /^Detalles / }))[0];
    await u.click(detail);
    const drawer = await screen.findByTestId("side-drawer");
    expect(within(drawer).getByLabelText(/^Es un identificador /)).not.toBeChecked();
    expect(within(drawer).getByLabelText(/^Disponible al momento de decidir /)).toBeChecked();
  });
});
