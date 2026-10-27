import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// #30: building a vector-store generation never changes production. A
// configuration pins the generation it searches; only an approved deploy
// request of a tested configuration publishes it. Real API, worker, LLM,
// DynamoDB and OpenSearch through nginx - nothing is mocked.
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);

const DATASET = "Muestra_total_ARIA_JUl_head5";
const suffix = randomUUID().slice(0, 8);

type Configuration = {
  configuration_id: string;
  version: number;
  name: string;
  general: unknown;
  infra: unknown;
  test: unknown;
  segments: Record<string, Segment>;
};
type Research = {
  enabled: boolean;
  vector_store_instance_id: string | null;
  vector_store_generation: number | null;
};
type Segment = { agent: { classification: { delegated_research: { vector_store: Research } } } };
type Generation = {
  generation: number;
  status: string;
  built?: boolean;
  in_production: boolean;
  pinned_by: string[];
  matches_manifest: boolean | null;
};

let manager: string;
let channelManager: string;
let original: Configuration;
let segmentKey: string;
let instance: { id: string; version: number; name: string };
const taxonomyIds: string[] = [];
const testRunIds: string[] = [];

async function call(
  request: APIRequestContext,
  token: string,
  method: string,
  path: string,
  data?: unknown,
) {
  return request.fetch(`/api/v0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
}

async function ok<T>(
  request: APIRequestContext,
  token: string,
  method: string,
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await call(request, token, method, path, data);
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
  return response.status() === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function login(request: APIRequestContext, email?: string, password?: string) {
  const response = await request.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { access_token: string }).access_token;
}

const generationsPath = () =>
  `/vector-store-instances/${encodeURIComponent(instance.id)}/generations`;

async function generations(request: APIRequestContext) {
  return ok<Generation[]>(request, manager, "GET", generationsPath());
}

async function addTaxonomy(request: APIRequestContext, label: string) {
  const taxonomy = await ok<{ id: string; name: string }>(
    request,
    manager,
    "POST",
    "/library/taxonomies",
    {
      code: `E2E-VSG-${suffix}-${label}`,
      name: `Suplantación ${label} ${suffix}`,
      description: `Fraude por suplantación de identidad, variante ${label} del ciclo de generaciones`,
      variables: ["canal"],
      examples: [`cliente reporta suplantación ${label}`],
    },
  );
  taxonomyIds.push(taxonomy.id);
  await ok(
    request,
    manager,
    "POST",
    `/vector-store-instances/${encodeURIComponent(instance.id)}/documents`,
    { asset_type: "taxonomy", asset_id: taxonomy.id },
  );
  return taxonomy;
}

async function build(request: APIRequestContext) {
  return ok<Generation>(request, manager, "POST", generationsPath());
}

function withPin(generation: number | null) {
  const segments = JSON.parse(JSON.stringify(original.segments)) as Record<string, Segment>;
  const research = segments[segmentKey]!.agent.classification.delegated_research.vector_store;
  research.enabled = true;
  research.vector_store_instance_id = instance.id;
  research.vector_store_generation = generation;
  return segments;
}

function pinOf(configuration: Configuration) {
  return configuration.segments[segmentKey]!.agent.classification.delegated_research.vector_store
    .vector_store_generation;
}

async function saveConfiguration(
  request: APIRequestContext,
  label: string,
  generation: number | null,
) {
  return ok<Configuration>(request, manager, "POST", "/configurations", {
    name: `E2E VS generaciones ${label} ${suffix}`,
    description: "Ciclo #30: la configuración fija la generación que consulta",
    general: original.general,
    infra: original.infra,
    test: original.test,
    segments: withPin(generation),
  });
}

function finalAnswer(value: Record<string, unknown>) {
  return `Prueba de contrato del workflow. Responde exactamente con esta conclusión, sin herramientas:\nFinal Answer: ${JSON.stringify(value)}`;
}

function startTest(request: APIRequestContext, configuration: Configuration) {
  return call(request, manager, "POST", "/test-runs", {
    name: `E2E VS generaciones v${configuration.version}`,
    dataset_name: DATASET,
    sample_size: 1,
    config: {
      configuration_ref: {
        configuration_id: configuration.configuration_id,
        version: configuration.version,
      },
      max_feedback_iterations: 0,
      prompt_overrides: {
        profiling: "Resume únicamente los datos recibidos en una frase breve, sin inferencias.",
        detector: finalAnswer({
          is_fraud: "not_fraud",
          fraud_classification: "unknown",
          reasoning: "Escenario de generaciones de vector store",
        }),
        detector_adversarial: finalAnswer({
          decision: "pass",
          has_issues: false,
          feedback: "",
          weak_points: [],
          reasoning: "Revisión del escenario de generaciones",
        }),
      },
    },
  });
}

async function passTest(request: APIRequestContext, configuration: Configuration) {
  const response = await startTest(request, configuration);
  expect(response.ok(), `prueba v${configuration.version}: ${await response.text()}`).toBeTruthy();
  const { test_run_id: id } = (await response.json()) as { test_run_id: string };
  testRunIds.push(id);
  await expect
    .poll(
      async () =>
        (await ok<{ status: string }>(request, manager, "GET", `/test-runs/${id}`)).status,
      {
        timeout: 540_000,
        intervals: [1000, 2000],
      },
    )
    .toBe("SUCCEEDED");
}

async function deploy(request: APIRequestContext, target: Configuration, title: string) {
  const created = await ok<{ id: string }>(
    request,
    channelManager,
    "POST",
    "/configuration-deploy-requests",
    {
      target_configuration_id: target.configuration_id,
      target_version: target.version,
      title: `${title} ${suffix}`,
      message: "Publica la generación de vector store que fija esta configuración.",
    },
  );
  await ok(request, manager, "POST", `/configuration-deploy-requests/${created.id}/approve`);
  const active = await ok<Configuration>(request, manager, "GET", "/configurations/active");
  expect(`${active.configuration_id}:v${active.version}`).toBe(
    `${target.configuration_id}:v${target.version}`,
  );
  return active;
}

function cleanupInstance() {
  // The nightly retention job, scoped to this test's instance and with no
  // age grace, so only protections decide. Runs in the real worker.
  const output = execFileSync(
    "docker",
    [
      "compose",
      "-p",
      process.env.LOCAL_DOCKER_PROJECT ?? "aria-local",
      "-f",
      "deploy/local/docker/docker-compose.yml",
      "exec",
      "-T",
      "aria-worker-main",
      "python",
      "-m",
      "src.infrastructure.entrypoint.worker.vector_store_generations",
      "cleanup",
      "--apply",
      "--instance",
      instance.id,
      "--retention-days",
      "0",
    ],
    { cwd: resolve(process.cwd(), "../backend"), encoding: "utf8" },
  );
  return JSON.parse(output) as { retired: string[] };
}

async function expectProductionBadge(page: Page, generation: number) {
  await page.addInitScript(
    (value) => localStorage.setItem("aria.auth.accessToken", value),
    manager,
  );
  await page.goto("/biblioteca");
  await page.getByRole("button", { name: `v${instance.version} · ${instance.name}` }).click();
  const panel = page.getByRole("region", { name: "Generaciones de Vector Store" });
  await expect(panel.getByTestId(`vector-generation-${generation}`)).toContainText("En producción");
}

test.beforeAll(async ({ request }) => {
  manager = await login(request, process.env.E2E_MANAGER_EMAIL, process.env.E2E_MANAGER_PASSWORD);
  channelManager = await login(
    request,
    process.env.E2E_CHANNEL_MANAGER_EMAIL,
    process.env.E2E_CHANNEL_MANAGER_PASSWORD,
  );
  original = await ok<Configuration>(request, manager, "GET", "/configurations/active");
  segmentKey = Object.keys(original.segments)[0]!;
  expect(segmentKey, "la configuración activa necesita al menos un segmento").toBeTruthy();
  expect(
    (await ok<{ status: string }>(request, manager, "GET", `/datasets/${DATASET}/summary`)).status,
  ).toBe("READY");
  // Restoring production at the end goes through a deploy request, which
  // needs a passed test of the original version: prove it before changing
  // anything, so a failure here leaves production untouched.
  await passTest(request, original);
  instance = await ok(request, manager, "POST", "/vector-store-instances", {
    name: `E2E generaciones ${suffix}`,
    description: "Instancia temporal del ciclo de generaciones #30",
  });
});

test.afterAll(async ({ request }) => {
  if (!manager) return;
  const active = await ok<Configuration>(request, manager, "GET", "/configurations/active");
  if (
    original &&
    `${active.configuration_id}:v${active.version}` !==
      `${original.configuration_id}:v${original.version}`
  ) {
    await deploy(request, original, "E2E restaurar producción");
  }
  if (testRunIds.length) {
    await ok(request, manager, "DELETE", "/test-runs", { test_run_ids: testRunIds });
  }
  for (const id of taxonomyIds) {
    await call(request, manager, "DELETE", `/library/taxonomies/${encodeURIComponent(id)}`);
  }
});

test("construir no publica; desplegar, retener, rechazar pin retirado y revertir", async ({
  page,
  request,
}) => {
  // N: building twice the same manifest returns the same generation.
  const first = await addTaxonomy(request, "uno");
  const n = await build(request);
  expect([n.status, n.built, n.in_production]).toEqual(["ready", true, false]);
  const again = await build(request);
  expect([again.generation, again.built]).toEqual([n.generation, false]);

  // Saving pins N; the tested version is published only through approval.
  const configN = await saveConfiguration(request, "N", null);
  expect(pinOf(configN)).toBe(n.generation);
  await passTest(request, configN);
  const direct = await call(
    request,
    manager,
    "POST",
    `/configurations/${encodeURIComponent(configN.configuration_id)}/versions/${configN.version}/activate`,
  );
  expect(direct.status(), await direct.text()).toBe(409);
  const activeN = await deploy(request, configN, "E2E publicar generación N");
  expect(pinOf(activeN)).toBe(n.generation);

  // N+1: a changed manifest is built, but production keeps searching N.
  await addTaxonomy(request, "dos");
  expect(
    (await generations(request)).find((g) => g.generation === n.generation)?.matches_manifest,
  ).toBe(false);
  const n1 = await build(request);
  expect([n1.generation, n1.built, n1.in_production]).toEqual([n.generation + 1, true, false]);
  expect(pinOf(await ok<Configuration>(request, manager, "GET", "/configurations/active"))).toBe(
    n.generation,
  );
  const hits = await ok<{ vector_store_version: number }[]>(
    request,
    manager,
    "GET",
    `/vector-store-instances/${encodeURIComponent(instance.id)}/query?query=${encodeURIComponent(first.name)}&document_type=taxonomia&generation=${n.generation}`,
  );
  expect(hits.length).toBeGreaterThan(0);
  expect(new Set(hits.map((hit) => hit.vector_store_version))).toEqual(new Set([n.generation]));
  const listed = await ok<{ id: string; production_generations: number[] }[]>(
    request,
    manager,
    "GET",
    "/vector-store-instances",
  );
  expect(listed.find((item) => item.id === instance.id)?.production_generations).toEqual([
    n.generation,
  ]);
  await expectProductionBadge(page, n.generation);

  // Publish N+1 through its own tested configuration and approval.
  const configN1 = await saveConfiguration(request, "N1", n1.generation);
  expect(pinOf(configN1)).toBe(n1.generation);
  await passTest(request, configN1);
  await deploy(request, configN1, "E2E publicar generación N+1");

  // N+2 is pinned only by a draft: retention retires it, never N+1 (active)
  // nor N (the version active before it, kept for rollback).
  await addTaxonomy(request, "tres");
  const n2 = await build(request);
  const draft = await saveConfiguration(request, "borrador", n2.generation);
  const swept = cleanupInstance();
  expect(swept.retired).toEqual([`${instance.id}@g${n2.generation}`]);
  const statuses = Object.fromEntries(
    (await generations(request)).map((g) => [g.generation, g.status]),
  );
  expect(statuses).toMatchObject({
    [n.generation]: "ready",
    [n1.generation]: "ready",
    [n2.generation]: "retired",
  });

  // A version pinning a retired generation can no longer be tested or saved.
  const rejected = await startTest(request, draft);
  expect(rejected.status(), await rejected.text()).toBe(409);
  const unsaved = await call(request, manager, "POST", "/configurations", {
    name: `E2E VS generaciones retirada ${suffix}`,
    description: "Pin retirado",
    general: original.general,
    infra: original.infra,
    test: original.test,
    segments: withPin(n2.generation),
  });
  expect(unsaved.status(), await unsaved.text()).toBe(409);

  // Rollback: the previous version and its generation go live again.
  const rolledBack = await deploy(request, configN, "E2E revertir a generación N");
  expect(pinOf(rolledBack)).toBe(n.generation);
});
