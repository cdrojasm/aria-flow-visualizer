import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeployRequestsPanel } from "@/components/configuracion/DeployRequestsPanel";
import type { ConfigurationDeployRequest } from "@/lib/api/configurations.functions";

const make = (id: string, over: Partial<ConfigurationDeployRequest>): ConfigurationDeployRequest => ({
  id,
  target_configuration_id: "cfg",
  target_version: 1,
  current_configuration_id: null,
  current_version: null,
  title: `Solicitud ${id}`,
  message: `Mensaje ${id}`,
  changes: [],
  requested_by: "ana",
  requested_at: "2026-11-01T10:00:00Z",
  status: "pending",
  approved_by: null,
  approved_at: null,
  ...over,
});

const requests = [
  make("a", { title: "Ajuste de umbral", requested_by: "carlos", requested_at: "2026-11-01T10:00:00Z" }),
  make("b", { title: "Nuevo prompt", requested_by: "ana", requested_at: "2026-11-03T10:00:00Z", status: "approved", approved_by: "luis" }),
  make("c", { title: "Umbral de monto", requested_by: "beto", requested_at: "2026-11-02T10:00:00Z" }),
];

function titles() {
  return screen.getAllByTestId("deploy-request-row").map((row) => within(row).getAllByText(/./)[0].textContent);
}

function renderPanel(onApprove = vi.fn()) {
  render(
    <DeployRequestsPanel
      requests={requests}
      isLoading={false}
      isError={false}
      error={null}
      isStale={() => false}
      approving={false}
      onApprove={onApprove}
    />,
  );
  return onApprove;
}

describe("DeployRequestsPanel", () => {
  it("lists newest first by default", () => {
    renderPanel();
    expect(titles()).toEqual(["Nuevo prompt", "Umbral de monto", "Ajuste de umbral"]);
  });

  it("filters by title", () => {
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText("Buscar por título…"), { target: { value: "umbral" } });
    expect(titles()).toEqual(["Umbral de monto", "Ajuste de umbral"]);
    fireEvent.change(screen.getByPlaceholderText("Buscar por título…"), { target: { value: "zzz" } });
    expect(screen.getByText(/Ninguna solicitud coincide/)).toBeTruthy();
  });

  it("sorts by requester and toggles direction", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Solicitante" }));
    expect(titles()).toEqual(["Nuevo prompt", "Umbral de monto", "Ajuste de umbral"]); // ana, beto, carlos
    fireEvent.click(screen.getByRole("button", { name: "Solicitante" }));
    expect(titles()).toEqual(["Ajuste de umbral", "Umbral de monto", "Nuevo prompt"]);
  });

  it("collapses and approves only pending requests", () => {
    const onApprove = renderPanel();
    expect(screen.getAllByRole("button", { name: /Aprobar y desplegar/ })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: /Aprobar y desplegar/ })[0]);
    expect(onApprove).toHaveBeenCalledWith("c");
    fireEvent.click(screen.getByRole("button", { name: /Contraer/ }));
    expect(screen.queryByTestId("deploy-request-row")).toBeNull();
  });
});

describe("DeployRequestsPanel columns", () => {
  it("keeps each header aligned with its cell", () => {
    renderPanel();
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent?.trim());
    expect(headers.slice(0, 4)).toEqual(["Solicitud", "Solicitante", "Recientes", "Estado"]);
    const cells = within(screen.getAllByTestId("deploy-request-row")[0]).getAllByRole("cell");
    expect(cells[1].textContent).toBe("ana"); // Solicitante
    expect(cells[2].textContent).toMatch(/\d/); // fecha
    expect(cells[3].textContent).toMatch(/Aprobada/); // Estado
  });
});
