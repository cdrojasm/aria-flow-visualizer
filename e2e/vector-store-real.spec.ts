import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { randomBytes } from "node:crypto";

test.setTimeout(180_000);

const E2E_EMAIL = "e03-vector-store@example.com";
let bootstrapApi: APIRequestContext | undefined;
let credentials: { email: string; password: string } | undefined;
let fixtureTaxonomyId: string | undefined;
let rollbackTaxonomyId: string | undefined;
let rollbackTaxonomyCode: string | undefined;

type Auth = { access_token: string };
type User = { id: string; email: string; name: string };
type Taxonomy = { id: string; code: string; name: string; active: boolean };
type ModusOperandi = { id: string; title: string; taxonomy_library_id: string };
type Instance = { id: string; version: number; name: string };
type Relation = {
  relation_id: string;
  asset_type: string;
  asset_id: string;
  asset_version: number;
};

function auth(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

async function json<T>(response: APIResponse, label: string): Promise<T> {
  expect(response.ok(), `${label}: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function login(api: APIRequestContext, email: string, password: string): Promise<Auth> {
  return json<Auth>(
    await api.post("/api/v0/auth/login", { data: { email, password } }),
    "login E03",
  );
}

test.beforeAll(async ({ playwright }) => {
  bootstrapApi = await playwright.request.newContext({ baseURL: "http://localhost" });
  const preprovisionedEmail = process.env.E2E_DATA_ANALYST_EMAIL;
  const preprovisionedPassword = process.env.E2E_DATA_ANALYST_PASSWORD;
  if (preprovisionedEmail && preprovisionedPassword) {
    credentials = { email: preprovisionedEmail, password: preprovisionedPassword };
    await login(bootstrapApi, credentials.email, credentials.password);
    return;
  }
  const bootstrapToken = process.env.E2E_BOOTSTRAP_TOKEN;
  test.skip(
    !bootstrapToken,
    "Define E2E_BOOTSTRAP_TOKEN para provisionar o renovar el usuario E03 por nginx.",
  );
  const headers = { "X-Bootstrap-Token": bootstrapToken! };
  const listed = await bootstrapApi.get("/api/v0/auth/users", { headers });
  const users = await json<User[]>(listed, "listar usuarios para aprovisionamiento E03");
  const existing =
    users.find((user) => user.email === E2E_EMAIL) ??
    users.find((user) => user.name.startsWith("E03 E2E"));
  credentials = {
    email: existing?.email ?? E2E_EMAIL,
    password: `E03-${randomBytes(32).toString("base64url")}-Aa9!`,
  };

  if (existing) {
    const reset = await bootstrapApi.put(
      `/api/v0/auth/users/${encodeURIComponent(existing.id)}/password`,
      {
        headers,
        data: { password: credentials.password },
      },
    );
    expect(reset.ok(), `renovar usuario E03: ${await reset.text()}`).toBeTruthy();
  } else {
    const created = await bootstrapApi.post("/api/v0/auth/users", {
      headers,
      data: {
        email: credentials.email,
        name: "E03 Vector Store E2E",
        role: "data_analyst",
        password: credentials.password,
      },
    });
    expect(created.status(), `crear usuario E03: ${await created.text()}`).toBe(201);
  }

  await login(bootstrapApi, credentials.email, credentials.password);
});

test.afterAll(async () => {
  if (
    bootstrapApi &&
    credentials &&
    (fixtureTaxonomyId || rollbackTaxonomyId || rollbackTaxonomyCode)
  ) {
    const { access_token: token } = await login(
      bootstrapApi,
      credentials.email,
      credentials.password,
    );
    if (fixtureTaxonomyId) {
      const removed = await bootstrapApi.delete(
        `/api/v0/library/taxonomies/${encodeURIComponent(fixtureTaxonomyId)}`,
        auth(token),
      );
      expect(removed.status(), `limpiar fixture E03: ${await removed.text()}`).toBe(204);
    }
    if (rollbackTaxonomyId) {
      const removed = await bootstrapApi.delete(
        `/api/v0/library/taxonomies/${encodeURIComponent(rollbackTaxonomyId)}`,
        auth(token),
      );
      expect(removed.status(), `limpiar taxonomía rollback E03: ${await removed.text()}`).toBe(204);
    } else if (rollbackTaxonomyCode) {
      const taxonomies = await json<Taxonomy[]>(
        await bootstrapApi.get("/api/v0/library/taxonomies?active_only=false", auth(token)),
        "buscar taxonomía parcial E03",
      );
      const partial = taxonomies.find((taxonomy) => taxonomy.code === rollbackTaxonomyCode);
      if (partial) {
        const removed = await bootstrapApi.delete(
          `/api/v0/library/taxonomies/${encodeURIComponent(partial.id)}`,
          auth(token),
        );
        expect(removed.status(), `limpiar taxonomía parcial E03: ${await removed.text()}`).toBe(
          204,
        );
      }
    }
  }
  await bootstrapApi?.dispose();
});

async function listInstances(api: APIRequestContext, token: string) {
  return json<Instance[]>(
    await api.get("/api/v0/vector-store-instances", auth(token)),
    "listar vector stores",
  );
}

async function listRelations(api: APIRequestContext, token: string, instanceId: string) {
  return json<Relation[]>(
    await api.get(
      `/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/documents`,
      auth(token),
    ),
    "listar relaciones",
  );
}

test("E03 real: conflictos concurrentes, validación y rollback en Biblioteca", async ({
  request,
}) => {
  test.skip(!credentials, "No se aprovisionó usuario E03; configura E2E_BOOTSTRAP_TOKEN.");
  const { email, password } = credentials!;
  const { access_token: token } = await login(request, email, password);
  let instances = await listInstances(request, token);
  if (instances.length === 0) {
    await json<Instance>(
      await request.post("/api/v0/vector-store-instances", {
        ...auth(token),
        data: {
          name: `E03 E2E ${randomBytes(6).toString("hex")}`,
          description: "Instancia temporal creada por E03 a través de la API real",
        },
      }),
      "crear instancia vector store E03",
    );
    instances = await listInstances(request, token);
  }
  expect(instances.length, "la API debe devolver la instancia vector store E03").toBeGreaterThan(0);
  const initialSnapshots = await Promise.all(
    instances.map(async (candidate) => ({
      candidate,
      relations: await listRelations(request, token, candidate.id),
    })),
  );
  const emptyBeforeFixture = initialSnapshots.find((entry) => entry.relations.length === 0);
  if (emptyBeforeFixture) {
    const promotion = await request.post(
      `/api/v0/vector-store-instances/${encodeURIComponent(emptyBeforeFixture.candidate.id)}/promote`,
      auth(token),
    );
    expect(promotion.status()).toBe(422);
    const afterPromotion = await listInstances(request, token);
    expect(
      afterPromotion.find((candidate) => candidate.id === emptyBeforeFixture.candidate.id),
    ).toEqual(emptyBeforeFixture.candidate);
  } else {
    test.info().annotations.push({
      type: "coverage-gap",
      description: "No hay una instancia vacía para probar la promoción rechazada.",
    });
  }

  const fixtureSuffix = randomBytes(8).toString("hex");
  const fixtureTaxonomy = await json<Taxonomy>(
    await request.post("/api/v0/library/taxonomies", {
      ...auth(token),
      data: {
        code: `E03-${fixtureSuffix}`,
        name: `Taxonomía E03 ${fixtureSuffix}`,
        description: "Fixture temporal E03 creado por API",
        variables: ["canal", "monto"],
        examples: ["compra sospechosa"],
      },
    }),
    "crear taxonomía fixture E03",
  );
  fixtureTaxonomyId = fixtureTaxonomy.id;
  const rollbackSuffix = randomBytes(8).toString("hex");
  const rollbackCode = `E03-${rollbackSuffix}`;
  rollbackTaxonomyCode = rollbackCode;
  const rollbackName = `Taxonomía E03 ${rollbackSuffix}`;
  let createdTaxonomy: Taxonomy | undefined;
  const [modusResponse, rollbackCreation] = await Promise.all([
    request.post("/api/v0/library/modus-operandi", {
      ...auth(token),
      data: {
        title: `MO E03 ${fixtureSuffix}`,
        narrative: "Fixture temporal para probar relaciones del grafo",
        taxonomy_library_id: fixtureTaxonomy.id,
        evolved_variables: ["frecuencia"],
      },
    }),
    request.post("/api/v0/library/taxonomies", {
      ...auth(token),
      data: {
        code: rollbackCode,
        name: rollbackName,
        description: "Fixture E03 temporal",
        variables: [],
        examples: [],
      },
    }),
  ]);
  const fixtureModus = await json<ModusOperandi>(modusResponse, "crear modus operandi fixture E03");
  if (rollbackCreation.status() === 201) {
    createdTaxonomy = (await rollbackCreation.json()) as Taxonomy;
    rollbackTaxonomyId = createdTaxonomy.id;
  } else {
    expect(rollbackCreation.status(), `crear taxonomía E03: ${await rollbackCreation.text()}`).toBe(
      500,
    );
  }
  const relationSnapshots = await Promise.all(
    instances.map(async (candidate) => ({
      candidate,
      relations: await listRelations(request, token, candidate.id),
    })),
  );
  const selected =
    relationSnapshots.find((entry) => entry.relations.length === 0) ?? relationSnapshots[0]!;
  const instance = selected.candidate;
  const relations = selected.relations;
  const graphFixture = { taxonomy: fixtureTaxonomy, modus: fixtureModus };

  // Concurrent duplicate names must be rejected without adding another version.
  const beforeDuplicates = await listInstances(request, token);
  const duplicateCreates = await Promise.all([
    request.post("/api/v0/vector-store-instances", {
      ...auth(token),
      data: { name: instance.name.toUpperCase(), description: "E03 duplicate race" },
    }),
    request.post("/api/v0/vector-store-instances", {
      ...auth(token),
      data: { name: instance.name, description: "E03 duplicate race" },
    }),
  ]);
  expect(duplicateCreates.map((response) => response.status())).toEqual([409, 409]);
  expect(await listInstances(request, token)).toEqual(beforeDuplicates);

  // Invalid asset types are rejected before any relation write.
  const [invalid, invalidPreflight] = await Promise.all([
    request.post(`/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents`, {
      ...auth(token),
      data: { asset_type: "not-a-knowledge-type", asset_id: "e03-missing" },
    }),
    request.post(
      `/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents/preflight`,
      { ...auth(token), data: { asset_type: "not-a-knowledge-type", asset_id: "e03-missing" } },
    ),
  ]);
  expect(invalid.status()).toBe(422);
  expect(invalidPreflight.status()).toBe(422);
  expect(await listRelations(request, token, instance.id)).toEqual(relations);

  if (graphFixture?.modus) {
    const fixtureRelations = new Set([
      `taxonomy:${graphFixture.taxonomy.id}`,
      `modus_operandi:${graphFixture.modus.id}`,
    ]);
    try {
      const beforeDetach = await listRelations(request, token, instance.id);
      const fixtureRows = beforeDetach.filter((relation) =>
        fixtureRelations.has(`${relation.asset_type}:${relation.asset_id}`),
      );
      const detached = await Promise.all(
        fixtureRows.map((relation) =>
          request.delete(
            `/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents/${encodeURIComponent(relation.relation_id)}`,
            auth(token),
          ),
        ),
      );
      expect(detached.every((response) => response.status() === 204)).toBe(true);

      // Simulate the user's stale preflight/confirmation window, then race
      // two requests against the same relation keys.
      const preflight = await json<{
        will_add: { asset_type: string; asset_id: string }[];
      }>(
        await request.post(
          `/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents/preflight`,
          {
            ...auth(token),
            data: { asset_type: "taxonomy", asset_id: graphFixture.taxonomy.id },
          },
        ),
        "preflight de taxonomía E03",
      );
      expect(
        preflight.will_add.map(({ asset_type, asset_id }) => ({ asset_type, asset_id })),
      ).toEqual(
        expect.arrayContaining([
          { asset_type: "taxonomy", asset_id: graphFixture.taxonomy.id },
          { asset_type: "modus_operandi", asset_id: graphFixture.modus.id },
        ]),
      );
      const concurrentAdds = await Promise.all([
        request.post(
          `/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents`,
          {
            ...auth(token),
            data: { asset_type: "taxonomy", asset_id: graphFixture.taxonomy.id },
          },
        ),
        request.post(
          `/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents`,
          {
            ...auth(token),
            data: { asset_type: "taxonomy", asset_id: graphFixture.taxonomy.id },
          },
        ),
      ]);
      expect(concurrentAdds.map((response) => response.status()).sort()).toEqual([201, 409]);
      const afterRace = await listRelations(request, token, instance.id);
      for (const key of fixtureRelations) {
        const [assetType, assetId] = key.split(":");
        expect(
          afterRace.filter((item) => item.asset_type === assetType && item.asset_id === assetId),
        ).toHaveLength(1);
      }

      const rootRelation = afterRace.find(
        (item) => item.asset_type === "taxonomy" && item.asset_id === graphFixture.taxonomy.id,
      );
      expect(rootRelation).toBeTruthy();
      const removedRoot = await request.delete(
        `/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents/${encodeURIComponent(rootRelation!.relation_id)}`,
        auth(token),
      );
      expect(removedRoot.status()).toBe(204);
      const sourceStillExists = await json<Taxonomy[]>(
        await request.get("/api/v0/library/taxonomies?active_only=false", auth(token)),
        "verificar que sobrevive la taxonomía fuente",
      );
      expect(sourceStillExists.some((entry) => entry.id === graphFixture.taxonomy.id)).toBe(true);
    } finally {
      const current = await listRelations(request, token, instance.id);
      const fixtureRows = current.filter((relation) =>
        fixtureRelations.has(`${relation.asset_type}:${relation.asset_id}`),
      );
      const removals = await Promise.all(
        fixtureRows.map((relation) =>
          request.delete(
            `/api/v0/vector-store-instances/${encodeURIComponent(instance.id)}/documents/${encodeURIComponent(relation.relation_id)}`,
            auth(token),
          ),
        ),
      );
      expect(removals.every((response) => response.status() === 204)).toBe(true);
    }
  }

  // Exercise taxonomy create/edit rollback. A healthy embedding provider creates
  // and then removes the fixture; a provider error must leave no partial row.
  try {
    if (createdTaxonomy) {
      const edited = await json<Taxonomy>(
        await request.patch(
          `/api/v0/library/taxonomies/${encodeURIComponent(createdTaxonomy.id)}`,
          {
            ...auth(token),
            data: { name: `${rollbackName} editada`, active: false },
          },
        ),
        "editar taxonomía E03",
      );
      expect(edited.name).toBe(`${rollbackName} editada`);
      expect(edited.active).toBe(false);

      const mockControlUrl = process.env.E2E_EMBEDDING_MOCK_CONTROL_URL;
      if (mockControlUrl) {
        const failNextUpdate = await request.post(`${mockControlUrl}/admin/fail-next`);
        expect(failNextUpdate.status()).toBe(204);
        const failedUpdate = await request.patch(
          `/api/v0/library/taxonomies/${encodeURIComponent(createdTaxonomy.id)}`,
          {
            ...auth(token),
            data: { name: `${rollbackName} edición fallida` },
          },
        );
        expect(failedUpdate.status()).toBe(500);
        const afterFailedUpdate = await json<Taxonomy[]>(
          await request.get("/api/v0/library/taxonomies?active_only=false", auth(token)),
          "verificar rollback de edición de taxonomía",
        );
        expect(afterFailedUpdate.find((entry) => entry.id === createdTaxonomy!.id)?.name).toBe(
          `${rollbackName} editada`,
        );

        const failedCode = `E03-FAIL-EMBED-${rollbackSuffix}`;
        const failNextCreate = await request.post(`${mockControlUrl}/admin/fail-next`);
        expect(failNextCreate.status()).toBe(204);
        const failedCreate = await request.post("/api/v0/library/taxonomies", {
          ...auth(token),
          data: {
            code: failedCode,
            name: `Taxonomía rollback ${rollbackSuffix}`,
            description: "Forzar fallo de embedding para comprobar rollback",
          },
        });
        expect(failedCreate.status()).toBe(500);
        const afterFailedCreate = await json<Taxonomy[]>(
          await request.get("/api/v0/library/taxonomies?active_only=false", auth(token)),
          "verificar rollback de creación de taxonomía",
        );
        expect(afterFailedCreate.some((entry) => entry.code === failedCode)).toBe(false);
      } else {
        test.info().annotations.push({
          type: "coverage-gap",
          description:
            "Los rollbacks por fallo de embedding requieren E2E_EMBEDDING_MOCK_CONTROL_URL.",
        });
      }
    }
  } finally {
    const afterCreate = await json<Taxonomy[]>(
      await request.get("/api/v0/library/taxonomies?active_only=false", auth(token)),
      "comprobar rollback de creación de taxonomía",
    );
    const partial = afterCreate.find((entry) => entry.code === rollbackCode);
    const partialWriteOccurred = !!partial;
    if (partial) {
      const removed = await request.delete(
        `/api/v0/library/taxonomies/${encodeURIComponent(partial.id)}`,
        auth(token),
      );
      expect(removed.status()).toBe(204);
    }
    rollbackTaxonomyId = undefined;
    rollbackTaxonomyCode = undefined;
    if (createdTaxonomy) {
      const afterCleanup = await json<Taxonomy[]>(
        await request.get("/api/v0/library/taxonomies?active_only=false", auth(token)),
        "verificar limpieza de taxonomía E03",
      );
      expect(afterCleanup.some((entry) => entry.id === createdTaxonomy!.id)).toBe(false);
    } else {
      expect(partialWriteOccurred, "un fallo al crear no debe dejar taxonomía parcial").toBe(false);
    }
  }
});
