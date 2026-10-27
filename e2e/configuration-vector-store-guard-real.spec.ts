import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.setTimeout(120_000);

type Auth = { access_token: string };
type VectorStoreResearch = { enabled: boolean; vector_store_instance_id: string | null };
type ToolStep = { delegated_research?: { vector_store?: VectorStoreResearch } };
type Segment = { order: number; agent: Record<string, ToolStep | undefined> };
type Configuration = {
  configuration_id: string;
  version: number;
  name: string;
  general: Record<string, unknown>;
  infra: Record<string, unknown>;
  test: Record<string, unknown>;
  segments: Record<string, Segment>;
};

const TOOL_STEPS = ["detector", "detector_adversarial", "classification", "adversarial"];

async function login(api: APIRequestContext, email: string, password: string): Promise<Auth> {
  const response = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), `login API: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Auth>;
}

async function authenticatePage(page: Page, token: string) {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: "aria.auth.accessToken",
    value: token,
  });
}

// Every step starts with the Búsqueda en Vector Store off, so the only way the
// save block can appear is through the switch this test flips.
function withVectorStoreOff(segments: Record<string, Segment>) {
  const copy = structuredClone(segments);
  for (const segment of Object.values(copy)) {
    for (const step of TOOL_STEPS) {
      const vectorStore = segment.agent[step]?.delegated_research?.vector_store;
      if (vectorStore) {
        vectorStore.enabled = false;
        vectorStore.vector_store_instance_id = null;
      }
    }
  }
  return copy;
}

test("configuración real: no deja guardar con Búsqueda en Vector Store activa y sin instancia", async ({
  page,
  request,
}) => {
  const email = process.env.E2E_CHANNEL_MANAGER_EMAIL;
  const password = process.env.E2E_CHANNEL_MANAGER_PASSWORD;
  test.skip(
    !email || !password,
    "Define E2E_CHANNEL_MANAGER_EMAIL y E2E_CHANNEL_MANAGER_PASSWORD.",
  );

  const auth = await login(request, email!, password!);
  const headers = { Authorization: `Bearer ${auth.access_token}` };
  const activeResponse = await request.get("/api/v0/configurations/active", { headers });
  expect(activeResponse.ok(), `configuración activa: ${await activeResponse.text()}`).toBeTruthy();
  const active = (await activeResponse.json()) as Configuration;

  const name = `E2E vector store ${randomUUID()}`;
  const seedResponse = await request.post("/api/v0/configurations", {
    headers,
    data: {
      name,
      description: "Configuración aislada para verificar el bloqueo de guardado del Vector Store.",
      general: active.general,
      infra: active.infra,
      test: active.test,
      segments: withVectorStoreOff(active.segments),
    },
  });
  expect(seedResponse.status(), await seedResponse.text()).toBe(201);
  const seed = (await seedResponse.json()) as Configuration;
  const firstSegment = Object.keys(seed.segments).sort(
    (a, b) => seed.segments[a].order - seed.segments[b].order,
  )[0];

  // The backend contract the UI guard mirrors: enabled without an instance is a 422.
  const invalidSegments = structuredClone(seed.segments);
  invalidSegments[firstSegment].agent.detector!.delegated_research!.vector_store = {
    ...invalidSegments[firstSegment].agent.detector!.delegated_research!.vector_store!,
    enabled: true,
    vector_store_instance_id: null,
  };
  const invalidResponse = await request.post("/api/v0/configurations", {
    headers,
    data: {
      name: seed.name,
      configuration_id: seed.configuration_id,
      based_on_version: seed.version,
      general: seed.general,
      infra: seed.infra,
      test: seed.test,
      segments: invalidSegments,
    },
  });
  expect(invalidResponse.status(), await invalidResponse.text()).toBe(422);

  const configurationPosts: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/v0/configurations") {
      configurationPosts.push(req.url());
    }
  });

  await authenticatePage(page, auth.access_token);
  await page.goto("/configuracion");
  await expect(page.getByRole("heading", { name: "Configuración del Agente" })).toBeVisible();

  const configSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Configuraciones" }) });
  const configPicker = configSection
    .getByRole("button", { name: "Configuración", exact: true })
    .locator("..");
  await configPicker.getByRole("button", { name: "Configuración", exact: true }).click();
  const configRow = configPicker.getByRole("button").filter({ hasText: name }).last();
  await expect(configRow).toBeVisible();
  await configRow.click();

  const startDraft = page.getByRole("button", { name: /Crear nueva versión basada en/ });
  await expect(startDraft).toBeVisible();
  await startDraft.click();

  await page.getByRole("button", { name: "Agente", exact: true }).click();
  await page.getByRole("button", { name: "Detector", exact: true }).click();

  const vectorStoreRow = page
    .getByText("Búsqueda en Vector Store", { exact: true })
    .locator("xpath=../..");
  const vectorStoreSwitch = vectorStoreRow.getByRole("switch");
  await expect(vectorStoreSwitch).not.toBeChecked();
  await vectorStoreSwitch.click();
  await expect(vectorStoreSwitch).toBeChecked();

  const saveButton = page.getByRole("button", { name: "Crear versión", exact: true });
  const saveBlock = page.getByTestId("vector-store-save-block");
  await expect(
    page.getByRole("alert").filter({ hasText: "Elige una instancia de Vector Store" }),
  ).toBeVisible();
  await expect(saveBlock).toContainText("Búsqueda en Vector Store activa sin instancia");
  await expect(saveBlock).toContainText("Detector");
  await expect(saveButton).toBeDisabled();

  // Turning the search off clears the block; the draft then matches its base
  // again, so nothing is pending to save.
  await vectorStoreSwitch.click();
  await expect(vectorStoreSwitch).not.toBeChecked();
  await expect(saveBlock).toHaveCount(0);
  expect(configurationPosts, "la UI no debe enviar la configuración inválida").toEqual([]);

  const versionsResponse = await request.get(
    `/api/v0/configurations/${encodeURIComponent(seed.configuration_id)}`,
    { headers },
  );
  expect(versionsResponse.ok(), await versionsResponse.text()).toBeTruthy();
  const versions = (await versionsResponse.json()) as Configuration[];
  expect(versions.map((entry) => entry.version)).toEqual([1]);
});
