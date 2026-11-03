import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

test.setTimeout(120_000);

type Auth = { access_token: string };
type Segment = {
  enabled: boolean;
  order: number;
  agent: {
    detector: { prompt: string };
    classification: { prompt: string };
  };
};
type Configuration = {
  configuration_id: string;
  version: number;
  name: string;
  description: string;
  active: boolean;
  general: Record<string, unknown>;
  infra: Record<string, unknown>;
  test: Record<string, unknown>;
  segments: Record<string, Segment>;
  parent_ref?: { configuration_id: string; version: number } | null;
};

async function login(api: APIRequestContext, email: string, password: string): Promise<Auth> {
  const response = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), `login API: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Auth>;
}

async function activeConfiguration(api: APIRequestContext, token: string) {
  const response = await api.get("/api/v0/configurations/active", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `configuración activa: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Configuration>;
}

function draftFrom(base: Configuration, patch: (draft: Configuration) => void) {
  const draft = structuredClone(base);
  patch(draft);
  return {
    name: base.name,
    description: draft.description,
    configuration_id: base.configuration_id,
    based_on_version: base.version,
    general: draft.general,
    infra: draft.infra,
    test: draft.test,
    segments: draft.segments,
  };
}

async function createConfiguration(
  api: APIRequestContext,
  token: string,
  payload: Record<string, unknown>,
) {
  return api.post("/api/v0/configurations", {
    headers: { Authorization: `Bearer ${token}` },
    data: payload,
  });
}

test("configuración real: ediciones concurrentes por canal y por campo", async ({ request }) => {
  const managerEmail = process.env.E2E_MANAGER_EMAIL;
  const managerPassword = process.env.E2E_MANAGER_PASSWORD;
  const channelManagerEmail = process.env.E2E_CHANNEL_MANAGER_EMAIL;
  const channelManagerPassword = process.env.E2E_CHANNEL_MANAGER_PASSWORD;

  test.skip(
    !managerEmail || !managerPassword || !channelManagerEmail || !channelManagerPassword,
    "Define credenciales E2E_MANAGER_* y E2E_CHANNEL_MANAGER_* para dos usuarios reales.",
  );

  const manager = await login(request, managerEmail!, managerPassword!);
  const channelManager = await login(request, channelManagerEmail!, channelManagerPassword!);
  const active = await activeConfiguration(request, manager.access_token);
  const channelCodes = Object.keys(active.segments);
  expect(
    channelCodes.length,
    "la configuración activa debe tener al menos dos canales",
  ).toBeGreaterThanOrEqual(2);

  const uniqueName = `E2E concurrencia ${randomUUID()}`;
  const seedResponse = await createConfiguration(request, manager.access_token, {
    name: uniqueName,
    description: "Configuración aislada para verificar ediciones simultáneas.",
    general: active.general,
    infra: active.infra,
    test: active.test,
    segments: active.segments,
  });
  expect(seedResponse.status(), await seedResponse.text()).toBe(201);
  let current = (await seedResponse.json()) as Configuration;

  const branchResponse = await createConfiguration(request, manager.access_token, {
    ...draftFrom(current, () => {}),
    name: `${uniqueName} rama`,
    configuration_id: null,
    based_on_version: null,
    parent_ref: { configuration_id: current.configuration_id, version: current.version },
  });
  expect(branchResponse.status(), await branchResponse.text()).toBe(201);
  const branch = (await branchResponse.json()) as Configuration;
  expect(branch.configuration_id).not.toBe(current.configuration_id);
  expect(branch.parent_ref).toEqual({
    configuration_id: current.configuration_id,
    version: current.version,
  });

  // Caso 1: una sola persona edita y guarda una nueva versión.
  const soloDescription = "Cambio individual guardado.";
  const soloResponse = await createConfiguration(
    request,
    manager.access_token,
    draftFrom(current, (draft) => {
      draft.description = soloDescription;
    }),
  );
  expect(soloResponse.status(), await soloResponse.text()).toBe(201);
  current = (await soloResponse.json()) as Configuration;
  expect(current.version).toBe(2);
  expect(current.description).toBe(soloDescription);
  expect(current.parent_ref).toEqual({
    configuration_id: current.configuration_id,
    version: 1,
  });
  const graphResponse = await request.get("/api/v0/configurations/graph", {
    headers: { Authorization: `Bearer ${manager.access_token}` },
  });
  expect(graphResponse.ok(), `grafo de configuración: ${await graphResponse.text()}`).toBeTruthy();
  const graph = (await graphResponse.json()) as Configuration[];
  expect(
    graph.find((node) => node.configuration_id === current.configuration_id && node.version === 2)
      ?.parent_ref,
  ).toEqual({ configuration_id: current.configuration_id, version: 1 });

  // Caso 2: dos personas parten de v2 y editan canales distintos. La segunda
  // escritura se basa deliberadamente en la versión anterior y debe conservar
  // ambos cambios en una nueva versión.
  const sharedBase = current;
  const [channelA, channelB] = channelCodes;
  const enabledA = !sharedBase.segments[channelA].enabled;
  const orderB = sharedBase.segments[channelB].order + 11;
  const channelAResponse = await createConfiguration(
    request,
    manager.access_token,
    draftFrom(sharedBase, (draft) => {
      draft.segments[channelA].enabled = enabledA;
    }),
  );
  expect(channelAResponse.status(), await channelAResponse.text()).toBe(201);

  const channelBResponse = await createConfiguration(
    request,
    channelManager.access_token,
    draftFrom(sharedBase, (draft) => {
      draft.segments[channelB].order = orderB;
    }),
  );
  expect(channelBResponse.status(), await channelBResponse.text()).toBe(201);
  current = (await channelBResponse.json()) as Configuration;
  expect(current.version).toBe(4);
  expect(current.segments[channelA].enabled).toBe(enabledA);
  expect(current.segments[channelB].order).toBe(orderB);

  // Caso 3: mismo canal, agentes/campos distintos. Los prompts del detector y
  // clasificación deben combinarse aunque el segundo editor parta de v4.
  const promptBase = current;
  const segment = promptBase.segments[channelA];
  const detectorPrompt = `E2E detector ${randomUUID()}`;
  const classificationPrompt = `E2E clasificación ${randomUUID()}`;
  const detectorResponse = await createConfiguration(
    request,
    manager.access_token,
    draftFrom(promptBase, (draft) => {
      draft.segments[channelA].agent.detector.prompt = detectorPrompt;
    }),
  );
  expect(detectorResponse.status(), await detectorResponse.text()).toBe(201);

  const classificationResponse = await createConfiguration(
    request,
    channelManager.access_token,
    draftFrom(promptBase, (draft) => {
      draft.segments[channelA].agent.classification.prompt = classificationPrompt;
    }),
  );
  expect(classificationResponse.status(), await classificationResponse.text()).toBe(201);
  current = (await classificationResponse.json()) as Configuration;
  expect(current.version).toBe(6);
  expect(current.segments[channelA].agent.detector.prompt).toBe(detectorPrompt);
  expect(current.segments[channelA].agent.classification.prompt).toBe(classificationPrompt);

  // Caso 4: ambas personas cambian el mismo prompt del mismo agente/canal.
  // El sistema debe señalar el conflicto y dejar intacta la última versión.
  const conflictBase = current;
  const localPrompt = `E2E prompt local ${randomUUID()}`;
  const remotePrompt = `E2E prompt remoto ${randomUUID()}`;
  const localResponse = await createConfiguration(
    request,
    manager.access_token,
    draftFrom(conflictBase, (draft) => {
      draft.segments[channelA].agent.detector.prompt = localPrompt;
    }),
  );
  expect(localResponse.status(), await localResponse.text()).toBe(201);
  const localVersion = (await localResponse.json()) as Configuration;

  const remoteResponse = await createConfiguration(
    request,
    channelManager.access_token,
    draftFrom(conflictBase, (draft) => {
      draft.segments[channelA].agent.detector.prompt = remotePrompt;
    }),
  );
  expect(remoteResponse.status()).toBe(409);
  const conflictBody = await remoteResponse.json();
  expect(JSON.stringify(conflictBody)).toContain(`segments.${channelA}.agent.detector.prompt`);

  const historyResponse = await request.get(
    `/api/v0/configurations/${encodeURIComponent(current.configuration_id)}`,
    { headers: { Authorization: `Bearer ${manager.access_token}` } },
  );
  expect(historyResponse.ok(), await historyResponse.text()).toBeTruthy();
  const history = (await historyResponse.json()) as Configuration[];
  expect(Math.max(...history.map((entry) => entry.version))).toBe(localVersion.version);
  expect(localVersion.segments[channelA].agent.detector.prompt).toBe(localPrompt);
  expect(segment.agent.detector.prompt).not.toBe(remotePrompt);
});
