import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { captureTurn, type ChatMessage } from "./agent-chat-helpers";

// The assistant lives on four views (/biblioteca, /modelos, /testing,
// /configuracion). On each one we ask how-to, cross-view, concept and
// follow-up questions against the real stack (no API mocking) and check what
// the backend grounded the answer on (project-map nodes) and which chips it
// returned. The LLM wording changes between runs, so assertions use the
// structured fields, never the prose.

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const email = process.env.E2E_CHANNEL_MANAGER_EMAIL;
const password = process.env.E2E_CHANNEL_MANAGER_PASSWORD;
const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;
type Credentials = { email?: string; password?: string };
let channelManagerCredentials: Credentials = { email, password };
let managerCredentials: Credentials = { email: managerEmail, password: managerPassword };

test.skip(!email || !password, "E2E_CHANNEL_MANAGER_EMAIL/PASSWORD are required");
test.describe.configure({ mode: "parallel" });

function credentialsForWorker(prefix: string, workerIndex: number, fallback: Credentials) {
  return {
    email: process.env[`E2E_${prefix}_W${workerIndex}_EMAIL`] ?? fallback.email,
    password: process.env[`E2E_${prefix}_W${workerIndex}_PASSWORD`] ?? fallback.password,
  };
}

async function clearOpenSessions(
  request: APIRequestContext,
  credentials: { email?: string; password?: string },
) {
  if (!credentials.email || !credentials.password) return;
  const login = await request.post(`${baseURL}/api/v0/auth/login`, { data: credentials });
  const loginBody = await login.text();
  expect(login.ok(), `login para limpiar sesiones E2E: ${loginBody}`).toBeTruthy();
  const { access_token: token } = JSON.parse(loginBody) as { access_token: string };
  const headers = { Authorization: `Bearer ${token}` };
  const listed = await request.get(`${baseURL}/api/v0/agent/sessions?limit=1000`, { headers });
  const listedBody = await listed.text();
  expect(listed.ok(), `listar sesiones E2E: ${listedBody}`).toBeTruthy();
  const sessions = JSON.parse(listedBody) as {
    session_id: string;
    status: string;
    mode: string;
  }[];
  const openStatuses = new Set(["DRAFT", "ACTIVE", "PAUSED", "WAITING_USER", "WAITING_APPROVAL"]);
  for (const session of sessions.filter(
    (item) => item.mode === "assistant" && openStatuses.has(item.status),
  )) {
    const cancelled = await request.post(
      `${baseURL}/api/v0/agent/sessions/${encodeURIComponent(session.session_id)}/cancel`,
      { headers },
    );
    expect(cancelled.ok(), `cerrar sesión E2E: ${await cancelled.text()}`).toBeTruthy();
  }
}

test.beforeEach(async ({ request }, testInfo) => {
  channelManagerCredentials = credentialsForWorker("CHANNEL_MANAGER", testInfo.parallelIndex, {
    email,
    password,
  });
  managerCredentials = credentialsForWorker("MANAGER", testInfo.parallelIndex, {
    email: managerEmail,
    password: managerPassword,
  });
  await clearOpenSessions(request, channelManagerCredentials);
  await clearOpenSessions(request, managerCredentials);
});

type Ref = { id: string; kind: string; label: string; path?: string };
type Answer = { content: string; references: Ref[]; context_used: Ref[] };

async function open(
  page: Page,
  path: string,
  credentials: Credentials = channelManagerCredentials,
) {
  const response = await page.request.post(`${baseURL}/api/v0/auth/login`, { data: credentials });
  const body = await response.text();
  expect(response.ok(), `login API: ${body}`).toBeTruthy();
  const { access_token: token } = JSON.parse(body) as { access_token: string };
  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
  await page.goto(path);
}

async function startChat(page: Page) {
  await page.getByRole("button", { name: "Abrir asistente ARIA" }).click();
  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v0/agent/sessions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Nueva", exact: true }).click();
  const response = await created;
  expect(response.ok(), `crear sesión ARIA: ${await response.text()}`).toBeTruthy();
  const { session_id: sessionId } = (await response.json()) as { session_id: string };
  expect(sessionId, "la API debe devolver session_id al crear una conversación").toBeTruthy();
  await expect(page.getByLabel("Conversación")).toHaveValue(sessionId);
}

async function ask(page: Page, question: string): Promise<{ sentPath: string; answer: Answer }> {
  const composer = page.getByLabel("Mensaje para ARIA");
  await expect(composer).toBeEnabled();
  const sent = page.waitForRequest(
    (request) => request.url().includes("/messages") && request.method() === "POST",
  );
  const { reply: answer } = await captureTurn<Answer & ChatMessage>(page, async () => {
    await composer.fill(question);
    await composer.press("Enter");
  });
  const body = (await sent).postDataJSON() as { page_path: string };
  expect(answer.content.trim().length).toBeGreaterThan(20);
  // Tool-call protocol must never leak into what the user reads.
  expect(answer.content).not.toContain('"tool_call"');
  return { sentPath: body.page_path, answer };
}

const ids = (answer: Answer) => answer.context_used.map((ref) => ref.id);
const paths = (answer: Answer) => answer.references.map((ref) => ref.path);

type Case = {
  question: string;
  // At least one of these project-map nodes must ground the answer (if any).
  grounded: string[];
  // Nodes the role cannot reach: they must not ground the answer or get a chip.
  hidden?: string[];
  // Chip destination expected when the answer points to another view.
  chip?: string;
};

const VIEWS: { path: string; label: string; cases: Case[] }[] = [
  {
    path: "/biblioteca",
    label: "Biblioteca",
    cases: [
      {
        question: "¿Cómo importo elementos a una lista negra desde un archivo?",
        grounded: ["task:importar-elementos-lista"],
      },
      {
        question: "¿Cómo creo un modus operandi nuevo?",
        grounded: ["task:crear-modus-operandi"],
      },
      { question: "¿Qué es una watchlist?", grounded: ["concept:watchlist"] },
      {
        question: "¿Cómo entreno un modelo?",
        grounded: ["task:entrenar-modelo", "view:/modelos"],
        chip: "/modelos",
      },
    ],
  },
  {
    path: "/modelos",
    label: "Modelos",
    cases: [
      {
        question: "¿Cómo pongo un modelo en producción?",
        grounded: ["task:activar-modelo"],
      },
      {
        question: "¿Qué es un modelo de fraude y cuál queda activo?",
        grounded: ["concept:modelo"],
      },
      {
        question: "¿Dónde subo un dataset para entrenar?",
        grounded: ["task:subir-dataset", "view:/biblioteca"],
        chip: "/biblioteca",
      },
    ],
  },
  {
    path: "/testing",
    label: "Testing",
    cases: [
      {
        question: "¿Cómo lanzo una prueba del agente?",
        grounded: ["task:ejecutar-prueba"],
      },
      {
        question: "¿Cómo veo los casos de una prueba?",
        grounded: ["task:ver-detalle-prueba", "view:/testing/$runId"],
      },
      {
        question: "¿Dónde veo los falsos positivos del agente?",
        grounded: ["task:revisar-desempeno-agente", "view:/monitor"],
        chip: "/monitor",
      },
    ],
  },
  {
    path: "/configuracion",
    label: "Configuración",
    cases: [
      {
        question: "¿Cómo despliego una configuración nueva?",
        grounded: ["task:desplegar-configuracion"],
      },
      {
        question: "¿Dónde ajusto los límites de mensajes del asistente?",
        grounded: ["task:ajustar-asistente"],
      },
      { question: "¿Qué es un insight propuesto?", grounded: ["concept:insight"] },
      {
        // Backups are not in the channel manager's navigation: it must be hidden.
        question: "¿Cómo creo un respaldo?",
        grounded: [],
        hidden: ["task:crear-respaldo", "view:/backups"],
      },
    ],
  },
];

for (const view of VIEWS) {
  test.describe(`asistente en ${view.label}`, () => {
    for (const item of view.cases) {
      test(item.question, async ({ page }) => {
        test.setTimeout(120_000);
        await open(page, view.path);
        await startChat(page);
        const { sentPath, answer } = await ask(page, item.question);

        expect(sentPath).toBe(view.path);
        if (item.grounded.length > 0) {
          expect(
            ids(answer).some((id) => item.grounded.includes(id)),
            `ids: ${ids(answer)}`,
          ).toBe(true);
        }
        for (const hiddenId of item.hidden ?? []) expect(ids(answer)).not.toContain(hiddenId);
        if (item.hidden) expect(paths(answer)).not.toContain("/backups");
        // A chip never points at the page the user is already on.
        expect(paths(answer)).not.toContain(view.path);

        if (item.chip) {
          expect(paths(answer)).toContain(item.chip);
          const panel = page.getByRole("complementary", { name: "Panel del asistente" });
          const chip = panel.locator(`a[href="${item.chip}"]`).first();
          await expect(chip).toBeVisible({ timeout: 30_000 });
          await chip.click();
          await expect(page).toHaveURL(new RegExp(`${item.chip}$`));
        }
      });
    }
  });
}

test("a follow-up on /testing keeps the topic of the previous question", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, "/testing");
  await startChat(page);
  await ask(page, "¿Cómo lanzo una prueba del agente?");
  const { answer } = await ask(page, "¿y cómo repito una que ya hice?");

  expect(ids(answer)).toContain("task:ejecutar-prueba");
  expect(ids(answer).some((id) => id.startsWith("action:repetir@"))).toBe(true);
});

test("the conversation stays on the view where it was started and the panel can be reopened", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page, "/modelos");
  await startChat(page);
  const first = await ask(page, "¿Cómo entreno un modelo?");
  expect(ids(first.answer)).toContain("task:entrenar-modelo");
  await page.getByRole("button", { name: "Cerrar asistente" }).click();
  await page.getByRole("button", { name: "Abrir asistente ARIA" }).click();
  const feed = page
    .getByRole("complementary", { name: "Panel del asistente" })
    .locator('[aria-live="polite"]');
  await expect(feed.locator("article").filter({ hasText: "Tú" }).first()).toBeVisible();
});

test("the assistant is not offered outside its four views", async ({ page }) => {
  await open(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir asistente ARIA" })).toHaveCount(0);
  await page.goto("/monitor");
  await expect(page.getByRole("button", { name: "Abrir asistente ARIA" })).toHaveCount(0);
});

test.describe("rol manager (sin acceso a Modelos ni Testing)", () => {
  test.skip(!managerEmail || !managerPassword, "E2E_MANAGER_EMAIL/PASSWORD are required");

  for (const path of ["/biblioteca", "/configuracion"]) {
    test(`en ${path} no recibe cómo entrenar un modelo ni chip a /modelos`, async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, path, managerCredentials);
      await startChat(page);
      const { answer } = await ask(page, "¿Cómo entreno un modelo?");

      expect(paths(answer)).not.toContain("/modelos");
      expect(ids(answer)).not.toContain("task:entrenar-modelo");
      expect(ids(answer)).not.toContain("view:/modelos");
    });
  }

  test("el manager sí recibe cómo crear un respaldo (su rol abre /backups)", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "/configuracion", managerCredentials);
    await startChat(page);
    const { answer } = await ask(page, "¿Cómo creo un respaldo?");

    expect(ids(answer)).toContain("task:crear-respaldo");
    expect(paths(answer)).toContain("/backups");
  });

  test("sí recibe ayuda de lo que su rol puede hacer en /configuracion", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "/configuracion", managerCredentials);
    await startChat(page);
    const { answer } = await ask(page, "¿Cómo despliego una configuración nueva?");

    expect(ids(answer)).toContain("task:desplegar-configuracion");
  });
});
