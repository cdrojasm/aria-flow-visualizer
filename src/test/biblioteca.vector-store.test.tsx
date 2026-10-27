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
  latest_generation: 2,
  production_generations: [1],
};

let relations: Array<{ relation_id: string; asset_type: string; asset_id: string; asset_version: number }>;
let addRequest: Record<string, unknown> | undefined;
let createRequest: Record<string, unknown> | undefined;
let buildRequests = 0;
let queryRequest: Record<string, string> | undefined;

const server = setupServer(
  http.get("*/api/v0/vector-store-instances", () => HttpResponse.json([instance])),
  http.post("*/api/v0/vector-store-instances", async ({ request }) => {
    createRequest = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...instance, id: "vector-store-v2", version: 2, name: createRequest.name });
  }),
  http.post("*/api/v0/vector-store-instances/:instanceId/generations", () => {
    buildRequests += 1;
    return HttpResponse.json({generation: 2, status: "ready", built: false});
  }),
  http.get("*/api/v0/vector-store-instances/:instanceId/generations", () => HttpResponse.json([
    { instance_id: instance.id, generation: 2, status: "ready", built_by: "Andrea Analista", created_at: instance.created_at,
      ready_at: instance.created_at, document_count: 2, in_production: false, pinned_by: [], matches_manifest: true },
    { instance_id: instance.id, generation: 1, status: "ready", built_by: "Andrea Analista", created_at: instance.created_at,
      ready_at: instance.created_at, document_count: 2, in_production: true, pinned_by: ["cfg@v1"], matches_manifest: true },
  ])),
  http.get("*/api/v0/vector-store-instances/:instanceId/documents", () => HttpResponse.json(relations)),
  http.get("*/api/v0/vector-store-instances/:instanceId/query", ({ request, params }) => {
    const url = new URL(request.url);
    queryRequest = {
      instanceId: String(params.instanceId),
      query: url.searchParams.get("query") ?? "",
      document_type: url.searchParams.get("document_type") ?? "",
      pipeline: url.searchParams.get("pipeline") ?? "",
      top_k: url.searchParams.get("top_k") ?? "",
      generation: url.searchParams.get("generation") ?? "",
    };
    return HttpResponse.json([{
      id: "hit-1",
      type: "red_flag",
      text: "Retiros inmediatos a múltiples destinos.",
      score: 0.9234,
      vector_store_id: String(params.instanceId),
      vector_store_version: 2,
    }]);
  }),
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
  queryRequest = undefined;
  buildRequests = 0;
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

  it("consulta la generación seleccionada con tipo y perfil elegidos y muestra score", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      await screen.findByPlaceholderText("Describe qué conocimiento quieres recuperar"),
      "retiros rápidos hacia varios destinos",
    );
    await user.selectOptions(screen.getByLabelText("Tipo de documento"), "red_flag");
    await user.selectOptions(screen.getByLabelText("Perfil de búsqueda"), "embedding_heavy");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("Retiros inmediatos a múltiples destinos.")).toBeInTheDocument();
    expect(screen.getByText("score 0.923")).toBeInTheDocument();
    expect(queryRequest).toEqual({
      instanceId: "vector-store-v1",
      query: "retiros rápidos hacia varios destinos",
      document_type: "red_flag",
      pipeline: "embedding_heavy",
      top_k: "5",
      generation: "2",
    });
    expect(screen.getAllByText("Generación 2", { exact: true }).length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText("Generación a consultar"), "1");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(queryRequest?.generation).toBe("1"));
  });

  it("explica que hace falta construir la instancia antes de consultar", async () => {
    server.use(
      http.get("*/api/v0/vector-store-instances", () =>
        HttpResponse.json([{ ...instance, latest_generation: null, production_generations: [] }]),
      ),
    );
    renderPage();

    expect(
      await screen.findByText("Construye esta instancia para probar consultas sobre sus documentos."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Buscar" })).not.toBeInTheDocument();
  });
  it("construir no publica ni cambia la generación en producción", async () => {
    relations = [{relation_id: "taxonomy:taxonomy-1", asset_type: "taxonomy", asset_id: "taxonomy-1", asset_version: 1}];
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("En producción");
    expect(screen.queryByRole("button", {name: "Promover", exact: true})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Construir generación"}));
    await waitFor(() => expect(buildRequests).toBe(1));
    expect(screen.getByTestId("vector-generation-1")).toHaveTextContent("En producción");
    expect(screen.getByTestId("vector-generation-2")).not.toHaveTextContent("En producción");
  });

});
