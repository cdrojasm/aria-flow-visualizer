import { apiFetch } from "./client";

// Client functions for scenario CRUD/lifecycle, served by the main aria-api
// (../backend's scenarios_router.py, mounted under /api/v0/scenarios).
// Ticking a running scenario is handled out-of-band by a separate Celery
// worker (../backend's src/infrastructure/entrypoint/simulator/), but that
// worker has no HTTP API of its own - it only reads/writes rows in the same
// DynamoDB table aria-api owns.
// It generates synthetic fraud-alert events on a schedule (a rate curve +
// per-field distributions, some fields LLM-generated) and either appends
// them to a Dataset or dispatches them into the real alert pipeline.

export type ScenarioStatus = "DRAFT" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED";
export type OutputMode = "DATASET" | "LIVE_PIPELINE";
export type GeneratorKind =
  | "CONSTANT"
  | "CATEGORICAL"
  | "UNIFORM"
  | "NORMAL"
  | "LOGNORMAL"
  | "POISSON"
  | "TEMPLATE_LLM"
  | "SEED_RECREATION";

export type RateInterval = {
  start_offset_seconds: number;
  end_offset_seconds: number;
  events_per_minute: number;
};

// Every field is optional except `kind` - which ones are actually read
// depends on it (see backend's field_generation.py / generate_event_batch.py):
//   CONSTANT: value
//   CATEGORICAL: weights ({value: weight})
//   UNIFORM: params.low / params.high
//   NORMAL / LOGNORMAL: params.mu / params.sigma
//   POISSON: params.lambda
//   TEMPLATE_LLM: system_prompt, user_prompt_template ({field} placeholders
//     resolve against this same event's earlier-declared fields), model,
//     temperature
//   SEED_RECREATION: same as TEMPLATE_LLM plus seed_dataset_name/seed_field
//     (pulls one real dataset row and asks the LLM to rewrite that field -
//     user_prompt_template can reference {seed_value})
export type FieldGenerator = {
  kind: GeneratorKind;
  value?: unknown;
  weights?: Record<string, number> | null;
  params?: Record<string, number> | null;
  system_prompt?: string | null;
  user_prompt_template?: string | null;
  model?: string | null;
  temperature?: number;
  seed_dataset_name?: string | null;
  seed_field?: string | null;
};

export type SimulationScenario = {
  id: string;
  name: string;
  status: ScenarioStatus;
  output_mode: OutputMode;
  rate_schedule: RateInterval[];
  field_specs: Record<string, FieldGenerator>;
  target_dataset_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  events_emitted: number;
  last_tick_offset_seconds: number;
  error: string | null;
};

export type SimulationStatus = {
  scenario_id: string;
  status: ScenarioStatus;
  events_emitted: number;
  last_tick_offset_seconds: number;
  error: string | null;
};

export type CreateScenarioRequest = {
  name: string;
  output_mode: OutputMode;
  rate_schedule: RateInterval[];
  field_specs: Record<string, FieldGenerator>;
  // Required when output_mode is "DATASET" - ignored for "LIVE_PIPELINE".
  target_dataset_name?: string | null;
  created_by?: string | null;
};

export type UpdateScenarioRequest = {
  name?: string;
  rate_schedule?: RateInterval[];
  field_specs?: Record<string, FieldGenerator>;
  target_dataset_name?: string | null;
};

export function createScenario({
  data,
}: {
  data: CreateScenarioRequest;
}): Promise<SimulationScenario> {
  return apiFetch("/api/v0/scenarios", { method: "POST", body: JSON.stringify(data) });
}

export function seedScenarioFromDataset({
  data,
}: {
  data: { dataset_name: string };
}): Promise<Record<string, FieldGenerator>> {
  return apiFetch("/api/v0/scenarios/seed-from-dataset", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listScenarios({
  data,
}: {
  data?: { status?: ScenarioStatus };
} = {}): Promise<SimulationScenario[]> {
  const query = data?.status ? `?status=${encodeURIComponent(data.status)}` : "";
  return apiFetch(`/api/v0/scenarios${query}`);
}

export function getScenario({ data }: { data: { id: string } }): Promise<SimulationScenario> {
  return apiFetch(`/api/v0/scenarios/${encodeURIComponent(data.id)}`);
}

export function updateScenario({
  data,
}: {
  data: { id: string } & UpdateScenarioRequest;
}): Promise<SimulationScenario> {
  const { id, ...body } = data;
  return apiFetch(`/api/v0/scenarios/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteScenario({ data }: { data: { id: string } }): Promise<void> {
  return apiFetch(`/api/v0/scenarios/${encodeURIComponent(data.id)}`, { method: "DELETE" });
}

export function startScenario({ data }: { data: { id: string } }): Promise<SimulationScenario> {
  return apiFetch(`/api/v0/scenarios/${encodeURIComponent(data.id)}/start`, { method: "POST" });
}

export function pauseScenario({ data }: { data: { id: string } }): Promise<SimulationScenario> {
  return apiFetch(`/api/v0/scenarios/${encodeURIComponent(data.id)}/pause`, { method: "POST" });
}

export function stopScenario({ data }: { data: { id: string } }): Promise<SimulationScenario> {
  return apiFetch(`/api/v0/scenarios/${encodeURIComponent(data.id)}/stop`, { method: "POST" });
}

export function getScenarioStatus({ data }: { data: { id: string } }): Promise<SimulationStatus> {
  return apiFetch(`/api/v0/scenarios/${encodeURIComponent(data.id)}/status`);
}

// Generates `count` fully-resolved sample rows ignoring the rate schedule
// entirely (including any LLM/seed-recreation fields) - doesn't persist or
// dispatch anything, purely for previewing what a scenario's fields will
// actually look like before starting it.
export function previewScenario({
  data,
}: {
  data: { id: string; count?: number };
}): Promise<Record<string, unknown>[]> {
  const query = data.count ? `?count=${data.count}` : "";
  return apiFetch(`/api/v0/scenarios/${encodeURIComponent(data.id)}/preview${query}`, {
    method: "POST",
  });
}
