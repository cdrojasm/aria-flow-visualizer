import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/biblioteca";

const BibliotecaPage = Route.options.component as ComponentType;

vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/hooks/useRole", () => ({
  useRole: () => ({
    user: { name: "Andrea Analista", role: "data_analyst" },
    role: "data_analyst",
    signIn: vi.fn(),
    logout: vi.fn(),
  }),
}));

const instance = {
  id: "vector-store-v1",
  version: 1,
  name: "Control inicial",
  description: "Cobertura de fraude digital",
  created_at: "2026-09-22T10:00:00Z",
  created_by: "Andrea Analista",
  updated_at: null,
  updated_by: null,
};

let relations: Array<{ relation_id: string; asset_type: string; asset_id: string; asset_version: number }>;
let addRequest: Record<string, unknown> | undefined;
let createRequest: Record<string, unknown> | undefined;

const server = setupServer(
  http.get("*/api/v0/vector-store-instances", () => HttpResponse.json([instance])),
  http.post("*/api/v0/vector-store-instances", async ({ request }) => {
    createRequest = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...instance, id: "vector-store-v2", version: 2, name: createRequest.name });
  }),
  http.get("*/api/v0/vector-store-instances/:instanceId/documents", () => HttpResponse.json(relations)),
  http.post("*/api/v0/vector-store-instances/:instanceId/documents/preflight", () => HttpResponse.json({
    instance_id: "vector-store-v1",
    will_add: [
      { asset_type: "taxonomy", asset_id: "taxonomy-1", origin: "selected" },
      { asset_type: "modus_operandi", asset_id: "mo-1", origin: "taxonomy" },
    ],
  })),
  http.post("*/api/v0/vector-store-instances/:instanceId/documents", async ({ request }) => {
    addRequest = await request.json() as Record<string, unknown>;
    relations = [
      { relation_id: "v1:taxonomy:taxonomy-1", asset_type: "taxonomy", asset_id: "taxonomy-1", asset_version: 1 },
      { relation_id: "v1:modus_operandi:mo-1", asset_type: "modus_operandi", asset_id: "mo-1", asset_version: 1 },
    ];
    return HttpResponse.json(relations);
  }),
  http.delete("*/api/v0/vector-store-instances/:instanceId/documents/:relationId", ({ params }) => {
    relations = relations.filter((relation) => relation.relation_id !== params.relationId);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v0/library/taxonomies", () => HttpResponse.json([{
    id: "taxonomy-1", code: "SUP", name: "Suplantación digital", description: "Uso de identidad ajena",
    variables: [], examples: [], active: true, created_at: "2026-09-22T10:00:00Z", updated_at: "2026-09-22T10:00:00Z",
  }])),
  http.get("*/api/v0/library/modus-operandi", () => HttpResponse.json([{
    id: "mo-1", title: "Captura de credenciales", narrative: "Engaño por mensajería", taxonomy_library_id: "taxonomy-1",
    evolved_variables: [], active: true, created_at: "2026-09-22T10:00:00Z", updated_at: "2026-09-22T10:00:00Z",
  }])),
  http.get("*/api/v0/library/flags", () => HttpResponse.json([])),
  http.get("*/api/v0/library/similar-cases", () => HttpResponse.json([])),
  http.get("*/api/v0/library/channels", () => HttpResponse.json([])),
  http.get("*/api/v0/tag-catalog", () => HttpResponse.json([])),
);

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><BibliotecaPage /></QueryClientProvider>);
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  relations = [];
  addRequest = undefined;
  createRequest = undefined;
});

describe("Base de conocimiento / Vector Store", () => {
  it("previsualiza y confirma la expansión de una taxonomía; quitarla sólo elimina la relación", async () => {
    const user = userEvent.setup();
    renderPage();

    expect((await screen.findAllByText("v1 · Control inicial")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Creado por: Andrea Analista/)).toBeInTheDocument();
    expect(screen.getByText("Filtra por tipo y usa texto o una expresión regular para buscar por nombre.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Nombre o expresión regular"), "Suplantación");
    await user.click(screen.getByRole("button", { name: "Agregar Suplantación digital a la instancia" }));

    expect(await screen.findByRole("heading", { name: "Agregar documentos a la instancia" })).toBeInTheDocument();
    expect(screen.getByText("Se agregarán 2 documentos relacionados.", { exact: false })).toBeInTheDocument();
    expect(addRequest).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Agregar documentos" }));
    await waitFor(() => expect(addRequest).toMatchObject({ asset_type: "taxonomy", asset_id: "taxonomy-1", asset_version: 1 }));
    expect(screen.queryByRole("button", { name: "Suplantación digital ya está agregado" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expandir Suplantación digital" }));
    await user.click(screen.getByRole("button", { name: "Quitar Suplantación digital de la instancia" }));
    await user.click(await screen.findByRole("button", { name: "Quitar Captura de credenciales de la instancia" }));
    expect(await screen.findByText("Aún no hay documentos relacionados.")).toBeInTheDocument();
    expect(screen.getByText("Suplantación digital")).toBeInTheDocument();
  });

  it("crea una versión sin enviar campos de auditoría controlados por el cliente", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("v1 · Control inicial");
    await user.type(screen.getByPlaceholderText("Nombre de versión"), "Candidato septiembre");
    await user.type(screen.getByPlaceholderText("Descripción"), "Validación antes de promover");
    await user.click(screen.getByRole("button", { name: "Crear versión" }));

    await waitFor(() => expect(createRequest).toEqual({ name: "Candidato septiembre", description: "Validación antes de promover" }));
  });
});
