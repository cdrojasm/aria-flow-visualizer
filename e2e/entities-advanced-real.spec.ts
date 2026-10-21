import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { randomBytes } from "node:crypto";

test.setTimeout(240_000);

const API = "http://localhost";
const USER_EMAIL = "e03-entities-advanced@example.com";
const INSTANCE_NAMES = ["E2E Entidades Avanzado A", "E2E Entidades Avanzado B"];
const BASELINE_CODE = "E03-ENTIDADES-ADV-BASE";

type Auth = { access_token: string };
type Instance = {
  id: string;
  name: string;
  promoted_version: number | null;
};
type Relation = {
  relation_id: string;
  asset_type: string;
  asset_id: string;
  asset_version: number;
};
type Taxonomy = { id: string; code: string; name: string };
type ModusOperandi = { id: string; title: string; narrative: string; playbook?: unknown };
type LibraryAsset = { id: string; name?: string; title?: string; text?: string };

let bootstrapApi: APIRequestContext | undefined;
let credentials: { email: string; password: string } | undefined;
let token = "";
let targetInstances: Instance[] = [];
let fixtureTaxonomyId: string | undefined;

const auth = (accessToken: string) => ({
  headers: { Authorization: `Bearer ${accessToken}` },
});

async function json<T>(response: APIResponse, label: string): Promise<T> {
  expect(response.ok(), `${label}: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function login(api: APIRequestContext, email: string, password: string): Promise<Auth> {
  return json<Auth>(
    await api.post("/api/v0/auth/login", { data: { email, password } }),
    "login E03 advanced",
  );
}

async function listInstances(api: APIRequestContext): Promise<Instance[]> {
  return json<Instance[]>(
    await api.get("/api/v0/vector-store-instances", auth(token)),
    "listar instancias vector store",
  );
}

async function listDocuments(api: APIRequestContext, instanceId: string): Promise<Relation[]> {
  return json<Relation[]>(
    await api.get(
      `/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/documents`,
      auth(token),
    ),
    `listar documentos ${instanceId}`,
  );
}

function assetKey(relation: Relation) {
  return `${relation.asset_type}:${relation.asset_id}`;
}

async function promote(api: APIRequestContext, instanceId: string): Promise<Instance> {
  return json<Instance>(
    await api.post(
      `/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/promote`,
      auth(token),
    ),
    `promover vector store ${instanceId}`,
  );
}

async function queryInstance(
  api: APIRequestContext,
  instanceId: string,
  query: string,
  pipeline: "embedding_heavy" | "balanced" | "keyword_heavy",
  documentType = "modus_operandi",
) {
  return json<
    Array<{
      id: string;
      type: string;
      text: string;
      score: number;
      vector_store_id: string;
      vector_store_version: number;
    }>
  >(
    await api.get(`/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/query`, {
      ...auth(token),
      params: { query, document_type: documentType, pipeline, top_k: 5 },
    }),
    `consulta semántica ${pipeline} en ${instanceId}`,
  );
}

async function ensureTestInstances(api: APIRequestContext) {
  let instances = await listInstances(api);
  for (const name of INSTANCE_NAMES) {
    if (instances.some((instance) => instance.name === name)) continue;
    const created = await api.post("/api/v0/vector-store-instances", {
      ...auth(token),
      data: { name, description: "Instancia reutilizable del E2E avanzado de entidades." },
    });
    if (created.status() !== 201 && created.status() !== 409) {
      throw new Error(`crear instancia E2E ${name}: ${created.status()} ${await created.text()}`);
    }
    instances = await listInstances(api);
  }
  targetInstances = INSTANCE_NAMES.map((name) => {
    const instance = instances.find((item) => item.name === name);
    if (!instance) throw new Error(`No quedó disponible la instancia E2E ${name}`);
    return instance;
  });
}

async function ensureBaselineTaxonomy(api: APIRequestContext) {
  const entries = await json<Taxonomy[]>(
    await api.get("/api/v0/library/taxonomies?active_only=false", auth(token)),
    "listar taxonomías para baseline E03",
  );
  let baseline = entries.find((item) => item.code === BASELINE_CODE);
  if (!baseline) {
    baseline = await json<Taxonomy>(
      await api.post("/api/v0/library/taxonomies", {
        ...auth(token),
        data: {
          code: BASELINE_CODE,
          name: "E03 entidades advanced baseline",
          description: "Asset persistente para restaurar el índice de las instancias E2E.",
          examples: ["fixture de restauración del test avanzado"],
        },
      }),
      "crear taxonomía baseline E03",
    );
  }

  const instances = await listInstances(api);
  const targetIds = new Set(targetInstances.map((instance) => instance.id));
  for (const instance of instances) {
    const docs = await listDocuments(api, instance.id);
    const baselineRelation = docs.find(
      (item) => item.asset_type === "taxonomy" && item.asset_id === baseline!.id,
    );
    if (targetIds.has(instance.id) && !baselineRelation) {
      await json<Relation[]>(
        await api.post(
          `/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents`,
          { ...auth(token), data: { asset_type: "taxonomy", asset_id: baseline.id } },
        ),
        `adjuntar baseline a ${instance.id}`,
      );
    } else if (!targetIds.has(instance.id) && baselineRelation) {
      const removed = await api.delete(
        `/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents/${encodeURIComponent(baselineRelation.relation_id)}`,
        auth(token),
      );
      expect(removed.status()).toBe(204);
    }
  }
}

test.beforeAll(async ({ playwright }) => {
  const bootstrapToken = process.env.E2E_BOOTSTRAP_TOKEN;
  test.skip(!bootstrapToken, "Define E2E_BOOTSTRAP_TOKEN para aprovisionar el usuario E03.");
  bootstrapApi = await playwright.request.newContext({ baseURL: API });
  let nginxReady = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const health = await bootstrapApi.get("/health", { timeout: 3_000 });
      if (health.status() === 200) {
        nginxReady = true;
        break;
      }
    } catch {
      // Nginx may briefly retain the previous API container address after a
      // compose recreate. The Make target recreates nginx before this check.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  expect(nginxReady, "nginx localhost debe alcanzar la API antes de provisionar").toBe(true);
  const headers = { "X-Bootstrap-Token": bootstrapToken! };
  const users = await json<Array<{ id: string; email: string }>>(
    await bootstrapApi.get("/api/v0/auth/users", { headers }),
    "listar usuarios E03",
  );
  const existing = users.find((user) => user.email === USER_EMAIL);
  credentials = {
    email: USER_EMAIL,
    password: `E03-${randomBytes(32).toString("base64url")}-Aa9!`,
  };
  if (existing) {
    const reset = await bootstrapApi.put(
      `/api/v0/auth/users/${encodeURIComponent(existing.id)}/password`,
      { headers, data: { password: credentials.password } },
    );
    expect(reset.ok(), `renovar usuario avanzado: ${await reset.text()}`).toBeTruthy();
  } else {
    const created = await bootstrapApi.post("/api/v0/auth/users", {
      headers,
      data: {
        email: credentials.email,
        name: "E03 Entidades Advanced",
        role: "data_analyst",
        password: credentials.password,
      },
    });
    expect(created.status(), `crear usuario avanzado: ${await created.text()}`).toBe(201);
  }
  token = (await login(bootstrapApi, credentials.email, credentials.password)).access_token;
  await ensureTestInstances(bootstrapApi);
  await ensureBaselineTaxonomy(bootstrapApi);

  // Recover from a previous process being interrupted before its finally
  // cleanup. The reserved E03-ADV prefix belongs only to this scenario.
  const oldFixtures = await json<Taxonomy[]>(
    await bootstrapApi.get("/api/v0/library/taxonomies?active_only=false", auth(token)),
    "buscar fixtures avanzados huérfanos",
  );
  for (const fixture of oldFixtures.filter((item) => item.code.startsWith("E03-ADV-"))) {
    const removed = await bootstrapApi.delete(
      `/api/v0/library/taxonomies/${encodeURIComponent(fixture.id)}`,
      auth(token),
    );
    expect(removed.status(), `limpiar fixture anterior ${fixture.code}`).toBe(204);
  }

  // Keep a known searchable generation on each dedicated test instance. The
  // advanced scenario promotes its fixture and restores this baseline after.
  for (const instance of targetInstances) {
    await promote(bootstrapApi, instance.id);
  }
});

test.afterAll(async () => {
  if (bootstrapApi && token) {
    const entries = await json<Taxonomy[]>(
      await bootstrapApi.get("/api/v0/library/taxonomies?active_only=false", auth(token)),
      "listar fixtures para limpieza final",
    );
    const fixtureIds = new Set(
      entries.filter((item) => item.code.startsWith("E03-ADV-")).map((item) => item.id),
    );
    if (fixtureTaxonomyId) fixtureIds.add(fixtureTaxonomyId);
    const restoreIndexes = fixtureIds.size > 0;
    for (const id of fixtureIds) {
      const removed = await bootstrapApi.delete(
        `/api/v0/library/taxonomies/${encodeURIComponent(id)}`,
        auth(token),
      );
      expect([204, 404]).toContain(removed.status());
    }
    if (restoreIndexes && targetInstances.length) {
      for (const instance of targetInstances) await promote(bootstrapApi, instance.id);
    }
  }
  await bootstrapApi?.dispose();
});

test("E03 entidades advanced: propagación, edición anidada, aislamiento y reindexación", async ({
  request,
}) => {
  test.skip(!token, "No se aprovisionó usuario E03; define E2E_BOOTSTRAP_TOKEN.");
  expect(targetInstances).toHaveLength(2);

  const before = new Map<string, string[]>();
  for (const instance of targetInstances) {
    before.set(instance.id, (await listDocuments(request, instance.id)).map(assetKey).sort());
  }

  const suffix = randomBytes(8).toString("hex");
  const fixtureCode = `E03-ADV-${suffix}`;
  const taxonomy = await json<Taxonomy>(
    await request.post("/api/v0/library/taxonomies", {
      ...auth(token),
      data: {
        code: fixtureCode,
        name: `Taxonomía avanzada ${suffix}`,
        description: "Árbol sintético para probar dos instancias y relaciones anidadas.",
        variables: ["canal", "monto", "dispositivo", "beneficiario"],
        examples: ["transferencia inmediata atípica", "cambio de dispositivo y beneficiario"],
      },
    }),
    "crear raíz de fixture avanzado",
  );
  fixtureTaxonomyId = taxonomy.id;

  let fixtureDeleted = false;
  try {
    const mo1 = await json<ModusOperandi>(
      await request.post("/api/v0/library/modus-operandi", {
        ...auth(token),
        data: {
          title: `Cadena de transferencias ${suffix}`,
          narrative:
            "El atacante vincula un dispositivo nuevo, eleva límites y distribuye el saldo en varias cuentas.",
          taxonomy_library_id: taxonomy.id,
          evolved_variables: ["monto acumulado", "antigüedad del dispositivo"],
        },
      }),
      "crear primer modus operandi",
    );
    const mo2 = await json<ModusOperandi>(
      await request.post("/api/v0/library/modus-operandi", {
        ...auth(token),
        data: {
          title: `Beneficiario mula ${suffix}`,
          narrative:
            "Una cuenta receptora concentra transferencias pequeñas y las retira de inmediato.",
          taxonomy_library_id: taxonomy.id,
          evolved_variables: ["velocidad de dispersión"],
        },
      }),
      "crear segundo modus operandi",
    );
    const case1 = await json<LibraryAsset>(
      await request.post("/api/v0/library/similar-cases", {
        ...auth(token),
        data: {
          text: `Caso ${suffix}: acceso desde dispositivo nuevo y dispersión en menos de cinco minutos.`,
          modus_operandi_library_id: mo1.id,
          taxonomy_library_id: taxonomy.id,
        },
      }),
      "crear caso similar del primer MO",
    );
    const case2 = await json<LibraryAsset>(
      await request.post("/api/v0/library/similar-cases", {
        ...auth(token),
        data: {
          text: `Caso ${suffix}: beneficiario reciente recibe múltiples pagos fraccionados.`,
          modus_operandi_library_id: mo2.id,
          taxonomy_library_id: taxonomy.id,
        },
      }),
      "crear caso similar del segundo MO",
    );
    const flag = await json<LibraryAsset>(
      await request.post("/api/v0/library/flags", {
        ...auth(token),
        data: {
          flag_type: "red",
          name: `Dispersión inmediata ${suffix}`,
          description: "El saldo recibido se divide y retira casi inmediatamente.",
          evolved_variables: ["tiempo hasta el primer retiro", "número de destinatarios"],
          modus_operandi_library_ids: [mo1.id, mo2.id],
        },
      }),
      "crear flag compartida por dos MOs",
    );

    const fixtureKeys = [
      `taxonomy:${taxonomy.id}`,
      `modus_operandi:${mo1.id}`,
      `modus_operandi:${mo2.id}`,
      `similar_case:${case1.id}`,
      `similar_case:${case2.id}`,
      `red_flag:${flag.id}`,
    ];
    for (const instance of targetInstances) {
      const docs = await listDocuments(request, instance.id);
      const keys = docs.map(assetKey);
      for (const key of fixtureKeys) expect(keys.filter((item) => item === key)).toHaveLength(1);
    }

    // Detach the same root from one vector store. Its sibling stays untouched,
    // and a competing re-attach must leave one relation rather than duplicate it.
    const [instanceA, instanceB] = targetInstances;
    const docsA = await listDocuments(request, instanceA.id);
    const rootA = docsA.find(
      (item) => item.asset_type === "taxonomy" && item.asset_id === taxonomy.id,
    )!;
    expect(
      (
        await request.delete(
          `/api/v0/vector-store-instances/${encodeURIComponent(instanceA.id)}/documents/${encodeURIComponent(rootA.relation_id)}`,
          auth(token),
        )
      ).status(),
    ).toBe(204);
    expect((await listDocuments(request, instanceB.id)).map(assetKey)).toContain(
      `taxonomy:${taxonomy.id}`,
    );
    const races = await Promise.all([
      request.post(`/api/v0/vector-store-instances/${encodeURIComponent(instanceA.id)}/documents`, {
        ...auth(token),
        data: { asset_type: "taxonomy", asset_id: taxonomy.id },
      }),
      request.post(`/api/v0/vector-store-instances/${encodeURIComponent(instanceA.id)}/documents`, {
        ...auth(token),
        data: { asset_type: "taxonomy", asset_id: taxonomy.id },
      }),
    ]);
    expect(races.map((response) => response.status()).sort()).toEqual([201, 409]);
    expect(
      (await listDocuments(request, instanceA.id)).filter(
        (item) => item.asset_type === "taxonomy" && item.asset_id === taxonomy.id,
      ),
    ).toHaveLength(1);

    // Edit the nested playbook and its source text. Invalid fallback choices
    // must be rejected without replacing the last valid document.
    const editedNarrative =
      "Tras cambiar el dispositivo, el atacante crea beneficiarios, eleva límites y dispersa fondos por múltiples cuentas en minutos.";
    const playbook = {
      strategy: `Investigar la secuencia completa ${suffix}; contrastar dispositivo, beneficiarios, montos y velocidad de dispersión.`,
      resolution: { resolution_tag: "handle_by_aria", resolution_method_id: null },
      if_no_voicebot: { resolution_tag: "block_soft", resolution_method_id: null },
      if_no_analyst: { resolution_tag: "send_to_voicebot", resolution_method_id: null },
    };
    const editedMo = await json<ModusOperandi>(
      await request.patch(`/api/v0/library/modus-operandi/${encodeURIComponent(mo1.id)}`, {
        ...auth(token),
        data: {
          narrative: editedNarrative,
          evolved_variables: ["dispositivo", "beneficiario", "velocidad"],
          playbook,
        },
      }),
      "editar contenido anidado del MO",
    );
    expect(editedMo.narrative).toBe(editedNarrative);
    expect(editedMo.playbook).toEqual(playbook);
    const invalidPlaybook = await request.patch(
      `/api/v0/library/modus-operandi/${encodeURIComponent(mo1.id)}`,
      {
        ...auth(token),
        data: {
          playbook: {
            ...playbook,
            if_no_voicebot: { resolution_tag: "send_to_voicebot", resolution_method_id: null },
          },
        },
      },
    );
    expect(invalidPlaybook.status()).toBe(422);
    const moList = await json<ModusOperandi[]>(
      await request.get("/api/v0/library/modus-operandi?active_only=false", auth(token)),
      "verificar que la edición inválida no alteró el playbook",
    );
    expect(moList.find((item) => item.id === mo1.id)?.playbook).toEqual(playbook);

    const editedCaseText = `Caso actualizado ${suffix}: dispositivo nuevo, aumento de límite y dispersión inmediata en tres beneficiarios.`;
    await json<LibraryAsset>(
      await request.patch(`/api/v0/library/similar-cases/${encodeURIComponent(case1.id)}`, {
        ...auth(token),
        data: { text: editedCaseText },
      }),
      "editar documento leaf similar case",
    );
    await json<LibraryAsset>(
      await request.patch(`/api/v0/library/flags/${encodeURIComponent(flag.id)}`, {
        ...auth(token),
        data: {
          description: `Regla avanzada ${suffix}: retiro menor a cinco minutos y múltiples destinos.`,
        },
      }),
      "editar flag compartida",
    );

    // Refresh changed source snapshots by detaching/re-attaching the edited
    // leaves. The next promotion must use their newly computed embeddings.
    const changedAssets = [
      { type: "modus_operandi", id: mo1.id },
      { type: "similar_case", id: case1.id },
      { type: "red_flag", id: flag.id },
    ];
    for (const instance of targetInstances) {
      for (const changed of changedAssets) {
        const current = await listDocuments(request, instance.id);
        const relation = current.find(
          (item) => item.asset_type === changed.type && item.asset_id === changed.id,
        );
        expect(relation, `relación ${changed.type}:${changed.id} en ${instance.id}`).toBeTruthy();
        expect(
          (
            await request.delete(
              `/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents/${encodeURIComponent(relation!.relation_id)}`,
              auth(token),
            )
          ).status(),
        ).toBe(204);
        const attached = await request.post(
          `/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents`,
          { ...auth(token), data: { asset_type: changed.type, asset_id: changed.id } },
        );
        expect(attached.status(), await attached.text()).toBe(201);
      }
    }

    // Promote both real instances to exercise OpenSearch's generation swap.
    // The finally block below removes the fixture and promotes the stable
    // baseline again, so the test index is left clean.
    for (const instance of targetInstances) {
      const current = (await listInstances(request)).find((item) => item.id === instance.id)!;
      const promoted = await promote(request, instance.id);
      expect(promoted.promoted_version).toBe((current.promoted_version ?? 0) + 1);
    }

    for (const instance of targetInstances) {
      const typedQueries = [
        {
          type: "taxonomia",
          query: "transferencias anómalas desde dispositivos y receptores nuevos",
          expected: `Taxonomía avanzada ${suffix}`,
        },
        {
          type: "similar_case",
          query: "teléfono nuevo y pagos distribuidos en pocos minutos",
          expected: `Caso actualizado ${suffix}`,
        },
        {
          type: "red_flag",
          query: "retiros rápidos dirigidos a múltiples destinos",
          expected: `Regla avanzada ${suffix}`,
        },
      ];
      for (const item of typedQueries) {
        const hits = await queryInstance(request, instance.id, item.query, "balanced", item.type);
        expect(
          hits.some((hit) => hit.type === item.type && hit.text.includes(item.expected)),
          `${item.type} debe recuperar su fixture esperado`,
        ).toBe(true);
      }
    }

    // Exercise the production retrieval path, including all three OpenSearch
    // search pipelines. The paraphrase deliberately avoids the source title.
    const paraphrase = "nuevo móvil, subir el límite y repartir el dinero entre varias cuentas";
    for (const instance of targetInstances) {
      const current = (await listInstances(request)).find((item) => item.id === instance.id)!;
      for (const pipeline of ["embedding_heavy", "balanced", "keyword_heavy"] as const) {
        const hits = await queryInstance(request, instance.id, paraphrase, pipeline);
        expect(hits.length, `${pipeline} debe recuperar documentos`).toBeGreaterThan(0);
        expect(hits[0].vector_store_id).toBe(instance.id);
        expect(hits[0].vector_store_version).toBe(current.promoted_version);
        expect(
          hits.some((hit) => hit.text.includes(`Cadena de transferencias ${suffix}`)),
          `${pipeline} debe recuperar el MO semánticamente relacionado`,
        ).toBe(true);
      }
    }

    const deleted = await request.delete(
      `/api/v0/library/taxonomies/${encodeURIComponent(taxonomy.id)}`,
      auth(token),
    );
    expect(deleted.status()).toBe(204);
    fixtureDeleted = true;

    const taxonomies = await json<Taxonomy[]>(
      await request.get("/api/v0/library/taxonomies?active_only=false", auth(token)),
      "comprobar cascada de raíz",
    );
    expect(taxonomies.some((item) => item.id === taxonomy.id)).toBe(false);
    const remainingMOs = await json<ModusOperandi[]>(
      await request.get("/api/v0/library/modus-operandi?active_only=false", auth(token)),
      "comprobar cascada de MOs",
    );
    expect(remainingMOs.some((item) => item.id === mo1.id || item.id === mo2.id)).toBe(false);
    for (const instance of targetInstances) {
      const docs = await listDocuments(request, instance.id);
      expect(docs.some((item) => fixtureKeys.includes(assetKey(item)))).toBe(false);
      expect(docs.map(assetKey).sort()).toEqual(before.get(instance.id));
    }
  } finally {
    if (!fixtureDeleted) {
      const removed = await request.delete(
        `/api/v0/library/taxonomies/${encodeURIComponent(taxonomy.id)}`,
        auth(token),
      );
      fixtureDeleted = removed.status() === 204 || removed.status() === 404;
    }
    if (fixtureDeleted) {
      for (const instance of targetInstances) {
        const beforeRestore = (await listInstances(request)).find(
          (item) => item.id === instance.id,
        )!;
        const restored = await promote(request, instance.id);
        expect(restored.promoted_version).toBe((beforeRestore.promoted_version ?? 0) + 1);
      }
      fixtureTaxonomyId = undefined;
    }
  }
});
