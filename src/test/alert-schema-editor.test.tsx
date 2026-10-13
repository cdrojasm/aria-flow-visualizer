import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AlertSchemaEditor } from "@/components/configuracion/schema/AlertSchemaEditor";

const testUser = {
  id: "proposer-1",
  email: "manager@test",
  name: "Manager",
  role: "manager",
  permissions: ["alert_schema"],
};
vi.mock("@/hooks/useRole", () => ({
  useRole: () => ({ user: testUser, role: "manager" }),
}));

vi.mock("@/lib/api/alertSchema.functions", () => ({
  getActiveAlertSchema: vi.fn().mockResolvedValue({
    version: 1,
    status: "active",
    fields: [],
    field_roles: {},
    proposed_by: null,
    proposed_at: null,
    approved_by: null,
    approved_at: null,
    impact_acknowledged: false,
    based_on_version: null,
    comparison: {},
    impact: [],
  }),
  listAlertSchemaVersions: vi.fn().mockResolvedValue([
    {
      version: 2,
      status: "proposed",
      fields: [],
      field_roles: {},
      proposed_by: "proposer-1",
      proposed_at: null,
      approved_by: null,
      approved_at: null,
      impact_acknowledged: false,
      based_on_version: 1,
      comparison: { added: ["amount"] },
      impact: [{ name: "Regla de monto" }],
    },
  ]),
  listAlertSchemaSuggestions: vi.fn().mockResolvedValue([]),
  getAlertSchemaPresence: vi.fn().mockResolvedValue(null),
  saveAlertSchemaDraft: vi.fn(),
  proposeAlertSchema: vi.fn(),
  approveAlertSchema: vi.fn(),
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

describe("gobierno del esquema", () => {
  it("deshabilita aprobar para quien propuso la versión", async () => {
    const user = userEvent.setup();
    renderEditor();
    const picker = await screen.findByRole("combobox", { name: "Versión del esquema" });
    await screen.findByRole("option", { name: /v2/ });
    await user.selectOptions(picker, "2");
    await user.click(screen.getByRole("button", { name: "Propuestas" }));
    expect(await screen.findByRole("button", { name: "Aprobar propuesta" })).toBeDisabled();
    expect(screen.getByText(/No puedes aprobar tu propia propuesta/)).toBeInTheDocument();
  });

  it("exige confirmar el impacto antes de aprobar", async () => {
    const user = userEvent.setup();
    testUser.id = "approver-1";
    renderEditor();
    const picker = await screen.findByRole("combobox", { name: "Versión del esquema" });
    await screen.findByRole("option", { name: /v2/ });
    await user.selectOptions(picker, "2");
    await user.click(screen.getByRole("button", { name: "Propuestas" }));
    const acknowledgement = await screen.findByRole("checkbox", { name: /Entiendo el impacto/ });
    expect(screen.getByRole("button", { name: "Aprobar propuesta" })).toBeDisabled();
    await user.click(acknowledgement);
    expect(screen.getByRole("button", { name: "Aprobar propuesta" })).toBeEnabled();
  });
});
