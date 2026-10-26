import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

// Optimizer center on the real stack (nginx -> API -> DynamoDB), without waiting for
// real LLM iterations: each scenario seeds one optimizer session in the state under
// test through the repositories the application uses (scripts/e2e_optimizer_seed.py)
// and then checks it through the UI and the public API. Every scenario is short.

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const email = process.env.E2E_CHANNEL_MANAGER_EMAIL;
const password = process.env.E2E_CHANNEL_MANAGER_PASSWORD;
const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;

test.skip(!email || !password, "E2E_CHANNEL_MANAGER_EMAIL/PASSWORD are required");
test.setTimeout(120_000);

const backend = resolve(process.cwd(), "../backend");
const python = process.env.E2E_PYTHON ?? "python3";
const prefix = `e2e-${randomUUID().slice(0, 6)}`;

let api: APIRequestContext;
let token = "";
let ownerEmail = "";

type State =
  | "running"
  | "stalled"
  | "blocked_budget"
  | "blocked_candidates"
  | "blocked_context"
  | "failing"
  | "inconclusive"
  | "completed"
  | "parallel";

function seedScript(args: string[]) {
  return execFileSync(python, ["scripts/e2e_optimizer_seed.py", ...args], {
    cwd: backend,
    encoding: "utf8",
    env: {
      ...process.env,
      LOCAL_DYNAMODB_PORT: process.env.LOCAL_DYNAMODB_PORT ?? "8002",
    },
  });
}

function seed(state: State): string {
  const output = seedScript([
    "seed",
    "--owner-email",
    ownerEmail,
    "--state",
    state,
    "--prefix",
    prefix,
  ]);
  return (JSON.parse(output.trim().split("\n").at(-1)!) as { session_id: string }).session_id;
}

async function login(request: APIRequestContext, user: string, secret: string) {
  const response = await request.post(`${baseURL}/api/v0/auth/login`, {
    data: { email: user, password: secret },
  });
  expect(response.ok(), `login: ${await response.text()}`).toBeTruthy();
  return ((await response.json()) as { access_token: string }).access_token;
}

const auth = () => ({ Authorization: `Bearer ${token}` });

async function overview(sessionId: string) {
  const response = await api.get(`${baseURL}/api/v0/agent/sessions/${sessionId}/overview`, {
    headers: auth(),
  });
  expect(response.ok(), `overview: ${await response.text()}`).toBeTruthy();
  return response.json();
}

async function openOptimizer(page: Page, sessionId: string, accessToken = token) {
  await page.addInitScript((value) => {
    localStorage.setItem("aria.auth.accessToken", value);
    localStorage.removeItem("aria.optimizer.tab");
  }, accessToken);
  await page.goto("/configuracion");
  await page.getByRole("button", { name: "Optimizador", exact: true }).click();
  await page.getByRole("tab", { name: new RegExp(`Optimizador ${sessionId} `) }).click();
  await expect(page.getByTestId("optimizer-verdict")).toBeVisible();
}

const section = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).click();

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext();
  token = await login(api, email!, password!);
  const me = await api.get(`${baseURL}/api/v0/auth/me`, { headers: auth() });
  expect(me.ok(), `auth/me: ${await me.text()}`).toBeTruthy();
  ownerEmail = ((await me.json()) as { email: string }).email;
});

test.afterAll(async () => {
  try {
    seedScript(["cleanup", "--prefix", prefix]);
  } finally {
    await api.dispose();
  }
});

test("el optimizador vive en Configuración del Channel Manager, no en el chat ni en otros perfiles", async ({
  page,
  browser,
}) => {
  const sessionId = seed("completed");
  await openOptimizer(page, sessionId);
  await expect(page.getByRole("heading", { name: "Optimizador", exact: true })).toBeVisible();

  // The assistant chat no longer carries an optimizer tab.
  await page.getByRole("button", { name: "Abrir asistente ARIA" }).click();
  const assistant = page.getByRole("complementary", { name: "Panel del asistente" });
  await expect(assistant).toBeVisible();
  await expect(assistant.getByRole("button", { name: "Optimizador", exact: true })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Panel del optimizador" })).toHaveCount(0);

  // A manager has no optimizer tab at all.
  test.skip(!managerEmail || !managerPassword, "E2E_MANAGER_EMAIL/PASSWORD are required");
  const managerContext = await browser.newContext({ baseURL });
  const managerToken = await login(api, managerEmail!, managerPassword!);
  await managerContext.addInitScript((value) => {
    localStorage.setItem("aria.auth.accessToken", value);
  }, managerToken);
  const managerPage = await managerContext.newPage();
  await managerPage.goto("/configuracion");
  await expect(
    managerPage.getByRole("heading", { name: "Configuración del Agente" }),
  ).toBeVisible();
  await expect(managerPage.getByRole("button", { name: "Optimizador", exact: true })).toHaveCount(
    0,
  );
  await managerContext.close();
});

test("sesión bloqueada por presupuesto: lo explica y el Channel Manager aprueba más", async ({
  page,
}) => {
  const sessionId = seed("blocked_budget");
  await openOptimizer(page, sessionId);
  const verdict = page.getByTestId("optimizer-verdict");
  await expect(verdict).toHaveAttribute("data-state", "blocked");
  await expect(verdict).toContainText("Presupuesto agotado");
  await expect(verdict).toContainText("Aprueba más presupuesto para que continúe.");

  await verdict.getByRole("button", { name: "Aprobar más presupuesto" }).click();
  const drawer = page.getByTestId("side-drawer");
  await drawer.getByLabel("Tokens a sumar").fill("999999999999");
  await drawer.getByRole("button", { name: "Aprobar y continuar" }).click();
  await expect(drawer.getByRole("alert")).toContainText("Supera el tope global");
  expect((await overview(sessionId)).verdict.state).toBe("blocked");

  await drawer.getByLabel("Tokens a sumar").fill("1000");
  await drawer.getByRole("button", { name: "Aprobar y continuar" }).click();
  await expect(drawer).toBeHidden();
  await expect.poll(async () => (await overview(sessionId)).status).not.toBe("WAITING_USER");
  expect((await overview(sessionId)).block).toEqual({});

  await section(page, "Línea de tiempo");
  await expect(page.getByTestId("timeline-list")).toContainText("Aprobaste más presupuesto");
});

test("sesión bloqueada por iteraciones: se aprueban más y la cuenta de estancamiento reinicia", async ({
  page,
}) => {
  const sessionId = seed("blocked_candidates");
  await openOptimizer(page, sessionId);
  await expect(page.getByTestId("optimizer-verdict")).toContainText(
    "Límite de propuestas alcanzado",
  );
  await page.getByRole("button", { name: "Aprobar más iteraciones" }).click();
  const drawer = page.getByTestId("side-drawer");
  await drawer.getByLabel("Iteraciones adicionales").selectOption("3");
  await drawer.getByRole("button", { name: "Aprobar y continuar" }).click();
  await expect(drawer).toBeHidden();
  await expect
    .poll(async () => {
      const response = await api.get(`${baseURL}/api/v0/agent/sessions`, { headers: auth() });
      const sessions = (await response.json()) as {
        session_id: string;
        candidate_allowance?: number;
      }[];
      return sessions.find((item) => item.session_id === sessionId)?.candidate_allowance;
    })
    .toBe(3);
});

test("sesión sin contexto: rechaza datos personales y convierte la pista en hipótesis", async ({
  page,
}) => {
  const sessionId = seed("blocked_context");
  await openOptimizer(page, sessionId);
  await expect(page.getByTestId("optimizer-verdict")).toContainText("Falta contexto");
  await page.getByRole("button", { name: "Dar contexto" }).click();
  const drawer = page.getByTestId("side-drawer");

  await drawer.getByLabel("Contexto para el agente").fill("Escribe a ana.perez@banco.com");
  await drawer.getByRole("button", { name: "Aprobar y continuar" }).click();
  await expect(drawer.getByRole("alert")).toContainText("datos personales");

  const clue = `Revisar falsos positivos nocturnos ${randomUUID().slice(0, 6)}`;
  await drawer.getByLabel("Contexto para el agente").fill(clue);
  await drawer.getByRole("button", { name: "Aprobar y continuar" }).click();
  await expect(drawer).toBeHidden();

  await section(page, "Corrida");
  await expect(page.getByTestId("candidates-list")).toContainText(clue);
  const hypotheses = await api.get(`${baseURL}/api/v0/agent/sessions/${sessionId}/hypotheses`, {
    headers: auth(),
  });
  expect(JSON.stringify(await hypotheses.json())).toContain(clue);
});

test("iteración fallida: muestra la razón del catálogo y cómo seguir, sin texto crudo", async ({
  page,
}) => {
  const sessionId = seed("failing");
  await openOptimizer(page, sessionId);
  const verdict = page.getByTestId("optimizer-verdict");
  await expect(verdict).toHaveAttribute("data-state", "failing");
  await expect(verdict).toContainText("Falló el entrenamiento");
  await expect(verdict).toContainText("Reintenta la iteración.");

  await section(page, "Corrida");
  await expect(page.getByTestId("experiments-list")).toContainText(
    "Falló la reproducción del pipeline",
  );
  await expect(page.getByTestId("experiments-list")).toContainText(
    "Revisa los workers de revisión",
  );
  await expect(page.getByTestId("experiments-list")).not.toContainText(
    "PIPELINE_REPLAY_WORKFLOW_FAILED",
  );

  await section(page, "Línea de tiempo");
  await page.getByLabel("Solo fallos y esperas").check();
  const rows = page.getByTestId("timeline-list").locator("li[data-outcome]");
  await expect(rows.first()).toBeVisible();
  for (const outcome of await rows.evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-outcome")),
  )) {
    expect(["FAILED", "BLOCKED"]).toContain(outcome);
  }
});

test("sesión terminada: hipótesis, comparación, cambio en producción y aprendizajes son legibles", async ({
  page,
}) => {
  const sessionId = seed("completed");
  await openOptimizer(page, sessionId);
  await expect(page.getByTestId("optimizer-verdict")).toContainText(
    "Terminó con 3 hipótesis validadas",
  );
  await expect(page.getByTestId("optimizer-cycle")).toBeVisible();

  await section(page, "Corrida");
  const tree = page.getByTestId("run-tree");
  // One structure: strategy, base configuration, winners and every candidate.
  await expect(tree.getByRole("region", { name: "Estrategia de la corrida" })).toContainText(
    "Promover el ganador",
  );
  await expect(
    tree.getByRole("region", { name: "Configuración base del optimizador" }),
  ).toContainText("hasta 3 por sesión");
  const winners = page.getByTestId("winners-table");
  await expect(winners.locator("tbody tr")).toHaveCount(3);
  await expect(winners.locator("tbody tr").first()).toContainText("Combinar los ganadores");
  await expect(winners.locator("tbody tr").first()).toContainText("+16.0 pts");
  await expect(page.getByTestId("winning-configuration")).toContainText("Modelo v2");
  await expect(page.getByTestId("winning-configuration")).toContainText("Configuración v2");
  const cards = page.getByTestId("candidate-card");
  await expect(cards).toHaveCount(3);
  const combination = page.locator("[data-testid='candidate-card'][data-area='combination']");
  await expect(combination).toContainText("Combina:");
  await expect(combination.getByRole("region", { name: "Conclusión" })).toContainText("Conservar");
  await expect(page.locator("[data-testid='candidate-card'][data-area='model']")).toContainText(
    "«Priorizar los falsos positivos de Digital en la noche»",
  );
  const table = combination.getByRole("table", { name: "Baseline contra candidato" });
  await expect(table).toContainText("+16.0 pts");
  await combination.getByRole("button", { name: "Eventos del experimento" }).click();
  await expect(combination.getByRole("list", { name: "Eventos del experimento" })).toContainText(
    "Experimento cumplió el objetivo global",
  );

  await section(page, "Línea de tiempo");
  await expect(page.getByTestId("timeline-list")).toContainText(
    "Registrado también en el log de auditoría",
  );

  await section(page, "Aprendizajes");
  await expect(page.getByRole("region", { name: "Hallazgos de esta sesión" })).toContainText(
    "94.0%",
  );
  await expect(page.getByTestId("learnings-list")).toContainText("120 casos");
});

test("candidatos en paralelo: la corrida muestra los tres en ejecución, uno por componente", async ({
  page,
}) => {
  const sessionId = seed("parallel");
  const response = await api.get(`${baseURL}/api/v0/agent/optimization-runs/${sessionId}`, {
    headers: auth(),
  });
  expect(response.ok(), `corrida: ${await response.text()}`).toBeTruthy();
  const run = (await response.json()) as {
    candidates: { hypothesis: { scope: { area: string } } }[];
    optimizer_settings: { max_parallel_experiments: number };
  };
  expect(run.candidates.map((item) => item.hypothesis.scope.area).sort()).toEqual([
    "configuration",
    "library",
    "model",
  ]);
  expect(run.optimizer_settings.max_parallel_experiments).toBe(3);

  await openOptimizer(page, sessionId);
  await expect(page.getByTestId("optimizer-verdict")).toContainText(
    "Trabajando en 3 candidatos en paralelo",
  );
  await section(page, "Corrida");
  await expect(page.getByTestId("parallel-running")).toContainText("3 en paralelo");
  const cards = page.getByTestId("candidate-card");
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card).toContainText("En ejecución");
  }
  await expect(page.getByTestId("winners-empty")).toBeVisible();
});

test("lo que muestra la línea de tiempo coincide con los eventos de la API", async ({ page }) => {
  const sessionId = seed("completed");
  const events = await api.get(`${baseURL}/api/v0/agent/sessions/${sessionId}/events`, {
    headers: auth(),
  });
  const body = (await events.json()) as { items: { seq: number }[]; last_seq: number };
  expect(body.items.map((item) => item.seq)).toEqual(
    [...body.items.map((item) => item.seq)].sort((left, right) => left - right),
  );
  await openOptimizer(page, sessionId);
  await section(page, "Línea de tiempo");
  await expect(
    page.getByText(`${body.items.length} de ${body.items.length} eventos`),
  ).toBeVisible();
  expect((await overview(sessionId)).events_total).toBe(body.last_seq);
});

test("sesión sin hallazgos concluyentes se marca inconclusa", async ({ page }) => {
  const sessionId = seed("inconclusive");
  await openOptimizer(page, sessionId);
  const verdict = page.getByTestId("optimizer-verdict");
  await expect(verdict).toHaveAttribute("data-state", "inconclusive");
  await expect(verdict).toContainText("Sin hallazgos concluyentes");
});

test("sesión en marcha: resalta la etapa actual del ciclo y muestra la reserva activa", async ({
  page,
}) => {
  const sessionId = seed("running");
  await openOptimizer(page, sessionId);
  await expect(page.getByTestId("optimizer-verdict")).toHaveAttribute("data-state", "running");
  await expect(page.getByTestId("optimizer-health")).toContainText("Reserva de ejecución: activa");
  await expect(
    page.getByTestId("optimizer-cycle").locator("[aria-current='step']"),
  ).toHaveAttribute("data-stage", "specialist");
});

test("worker caído: se ve como sin respuesta y el sistema lo recupera y lo deja en la línea de tiempo", async ({
  page,
}) => {
  let sessionId = "";
  // The recovery sweep runs every 30 s, so a freshly seeded dead session may be
  // recovered before the UI is looked at; retry with a new one.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    sessionId = seed("stalled");
    if ((await overview(sessionId)).verdict.state === "stalled") break;
  }
  expect((await overview(sessionId)).health.stalled).toBeTruthy();
  await openOptimizer(page, sessionId);
  const verdict = page.getByTestId("optimizer-verdict");
  if ((await verdict.getAttribute("data-state")) === "stalled") {
    await expect(verdict).toContainText("El worker dejó de responder");
  }

  await expect
    .poll(async () => (await overview(sessionId)).health.stalled, { timeout: 75_000 })
    .toBeFalsy();
  const events = (await (
    await api.get(`${baseURL}/api/v0/agent/sessions/${sessionId}/events`, { headers: auth() })
  ).json()) as { items: { kind: string; reason_code: string | null }[] };
  expect(
    events.items.some(
      (item) => item.kind === "recovery" && item.reason_code === "WORKER_LEASE_EXPIRED",
    ),
  ).toBeTruthy();
});

test("lanzar optimizador abre el drawer lateral con alcance y revisión", async ({ page }) => {
  const sessionId = seed("completed");
  await openOptimizer(page, sessionId);
  await page.getByRole("button", { name: "Lanzar optimizador" }).click();
  const drawer = page.getByTestId("side-drawer");
  await expect(drawer).toContainText("Alcance de la investigación");
  const review = drawer.getByRole("button", { name: "Revisar objetivo y presupuesto" });
  await expect(review).toBeDisabled();
  await drawer.getByLabel("Biblioteca", { exact: true }).check();
  await expect(review).toBeEnabled();
});
