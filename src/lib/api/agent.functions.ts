import { apiFetch } from "./client";

export type AgentSession = {
  session_id: string;
  mode: "assistant" | "optimization";
  status: string;
  created_at: string;
  updated_at: string;
  budget_limits: Record<string, number>;
  prompt_versions: Record<string, Record<string, string>>;
  rev: number;
  lease: {
    status: "NONE" | "ACTIVE" | "EXPIRED";
    expires_at: string | null;
    heartbeat_at: string | null;
  };
  scope?: { areas?: string[] };
};

export type AgentExperiment = {
  session_id: string;
  experiment_id: string;
  iteration_number: number;
  kind: "ISOLATED" | "COMBINATION";
  status: "RUNNING" | "SUCCEEDED" | "REJECTED_GLOBAL_CONSTRAINT" | "FAILED";
  components: Array<{
    component: "model" | "configuration" | "library" | "vector_store";
    entity_id: string;
    version: string;
    content_sha256: string;
  }>;
  baseline_components: Array<{
    component: "model" | "configuration" | "library" | "vector_store";
    entity_id: string;
    version: string;
    content_sha256: string;
  }>;
  snapshot_id: string | null;
  snapshot_sha256: string | null;
  objective_id: string;
  objective_version: number;
  created_at: string;
  completed_at: string | null;
  global_evaluation: {
    status?: string;
    sample?: Record<string, unknown>;
    metrics?: Record<string, unknown>;
    delta?: Record<string, unknown>;
    uncertainty?: Record<string, unknown>;
    segments?: Array<Record<string, unknown>>;
    constraints?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  error_code: string | null;
};

export type AgentReleasePin = {
  component: string;
  entity_id: string;
  version: string;
  content_sha256: string;
};
export type RetrospectiveValidation = {
  validation_id: string;
  session_id: string;
  experiment_id: string;
  status: string;
  snapshot_id: string;
  snapshot_sha256: string;
  component_pins: AgentReleasePin[];
  baseline_component_pins: AgentReleasePin[];
  evidence: Record<string, unknown>;
  created_by: string;
  created_by_id: string;
  created_at: string;
  error_code: string | null;
};
export type AgentRelease = {
  release_id: string;
  validation_id: string;
  session_id: string;
  experiment_id: string;
  status: string;
  candidate_component_pins: AgentReleasePin[];
  previous_component_pins: AgentReleasePin[];
  requested_by: string;
  requested_by_id: string;
  requested_at: string;
  title: string;
  reason: string;
  snapshot_id: string;
  snapshot_sha256: string;
  rollout_policy_version: string;
  version: number;
  approved_by: string | null;
  approved_by_id: string | null;
  approved_at: string | null;
  updated_at: string | null;
  observations: { count?: number; disagreements?: number };
  rollback_reason: string | null;
};

export type AgentAuditEvent = {
  event_id: string;
  occurred_at: string;
  category: "session" | "iteration" | "specialist" | "tool" | "experiment" | "lease" | "release";
  status: string;
  reason_code: string | null;
  duration_ms: number | null;
  cost_micros: number | null;
  specialist:
    | "optimizer"
    | "configuration"
    | "library"
    | "vector_store"
    | "model"
    | "dataset"
    | null;
  tool:
    | "read"
    | "write"
    | "evaluate"
    | "search"
    | "score"
    | "persist"
    | "dispatch"
    | "configuration"
    | "library"
    | "vector_store"
    | "xgboost"
    | null;
};

export type AgentAuditPage = { items: AgentAuditEvent[]; next_cursor: string | null };

export type AgentObjective = {
  version: number;
  success_label: string;
  positive_label: string;
  negative_label: string;
  primary_metrics: string[];
  precision_floor: number;
  minimum_global_support: number;
};

export type AgentIteration = {
  number: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  hypothesis: string | null;
  decision: string | null;
  reason: string | null;
  specialists: string[];
};

export type AgentPackageSummary = {
  package_id: string;
  session_id: string;
  iteration_number: number;
  status: string;
  content_hash: string | null;
  created_at: string | null;
  sealed_at: string | null;
};

export type AgentMessage = {
  message_id: string;
  client_message_id: string;
  seq: number;
  role: "user" | "assistant" | string;
  content: string;
  created_at: string;
  redaction_counts: Record<string, number>;
  extracted_insight_ids: string[];
  // Assistant messages: places worth opening (view or task entry) and the
  // project-map nodes the answer was grounded on.
  references?: AgentMessageReference[];
  context_used?: AgentMessageReference[];
};

export type AgentMessageReference = {
  id: string;
  kind: string;
  label: string;
  path?: string;
};

export type AgentInsight = {
  insight_id: string;
  kind: string;
  statement: string;
  scope: Record<string, string>;
  status: string;
  proposed_by: string;
  source_message_id: string | null;
  created_at: string;
  confidence: number | null;
};

export type AgentSessionSummary = {
  session_id: string;
  version: number;
  content: Record<string, unknown>;
  covers_seq_from: number;
  covers_seq_to: number;
  created_at: string;
} | null;

export type AgentChatTurn = {
  user_message: AgentMessage;
  assistant_message: AgentMessage | null;
  proposed_insights: AgentInsight[];
};

export type AgentDraftVerification = {
  verification_id: string;
  verifier: string;
  status: string;
  safe_metrics: Record<string, unknown>;
  error_code: string | null;
  created_at: string | null;
};

export type AgentLibraryDraft = {
  package_id: string;
  session_id: string;
  status: string;
  content_hash: string | null;
  content: {
    items?: Array<{
      item_id: string;
      item_type: string;
      operation: "create" | "update";
      target_ref: string | null;
      base_version: string | null;
      draft: Record<string, unknown>;
      diff: Record<string, unknown>;
      field_provenance: Record<string, { source?: string; message_id?: string | null }>;
      verification_status: string;
      approval_status: string;
      questions: string[];
    }>;
    [key: string]: unknown;
  };
  verifications: AgentDraftVerification[];
};

export type ModusOperandiDraft = AgentLibraryDraft;

export type AgentConfirmation = {
  confirmation_id: string;
  package_id: string;
  item_id: string;
  entity_id: string;
};

const path = "/api/v0/agent";

export type AgentDraftAction = {
  action_id: "modus_operandi" | "flag" | "similar_case" | "taxonomy" | "watchlist";
  label: string;
  endpoint_kind: string;
  operations: Array<"create" | "update">;
  required_permissions: string[];
  fields: string[];
  context: string[];
};

export function listAgentDraftActions() {
  return apiFetch<AgentDraftAction[]>(`${path}/draft-actions`);
}

export function listAgentSessions() {
  return apiFetch<AgentSession[]>(`${path}/sessions?limit=50`);
}

export function createAgentSession(mode: "assistant" | "optimization" = "assistant") {
  return apiFetch<AgentSession>(`${path}/sessions`, {
    method: "POST",
    body: JSON.stringify({ mode, scope: mode === "assistant" ? ["library"] : [] }),
  });
}

export function getActiveAgentObjective() {
  return apiFetch<AgentObjective>("/api/v0/agent/objectives/active");
}

export function createOptimizerSession(areas: string[]) {
  return apiFetch<AgentSession>(`${path}/sessions`, {
    method: "POST",
    body: JSON.stringify({ mode: "optimization", scope: areas }),
  });
}

export function startOptimizerSession(sessionId: string) {
  return apiFetch<AgentSession>(`${path}/sessions/${encodeURIComponent(sessionId)}/start`, {
    method: "POST",
  });
}

export function controlOptimizerSession(sessionId: string, action: "pause" | "resume" | "cancel") {
  return apiFetch<AgentSession>(`${path}/sessions/${encodeURIComponent(sessionId)}/${action}`, {
    method: "POST",
  });
}

export function listAgentIterations(sessionId: string) {
  return apiFetch<AgentIteration[]>(`${path}/sessions/${encodeURIComponent(sessionId)}/iterations`);
}

export function listAgentExperiments(sessionId: string, limit = 50) {
  return apiFetch<AgentExperiment[]>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/experiments?limit=${limit}`,
  );
}

export function getAgentExperiment(sessionId: string, experimentId: string) {
  return apiFetch<AgentExperiment>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/experiments/${encodeURIComponent(experimentId)}`,
  );
}

export function listAgentAudit(sessionId: string, limit = 50, cursor?: string) {
  const query = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
  return apiFetch<AgentAuditPage>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/audit?${query}`,
  );
}

export function listAgentHypotheses(sessionId: string) {
  return apiFetch<AgentHypothesis[]>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/hypotheses`,
  );
}

export type AgentHypothesis = {
  hypothesis_id: string;
  statement: string;
  scope: Record<string, string>;
  priority: number;
  status: string;
  source_insight_id: string | null;
};

export function listAgentPackages(sessionId: string) {
  return apiFetch<AgentPackageSummary[]>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/packages`,
  );
}

export function getAgentSessionBudget(sessionId: string) {
  return apiFetch<{ spent: Record<string, number> }>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/budget`,
  );
}

export function listAgentClaims(entityKey: string) {
  return apiFetch<
    Array<{
      entity_key: string;
      session_id: string;
      claimed_at: string;
      heartbeat_at: string;
      expires_at: string;
      reason: string;
    }>
  >(`${path}/claims/${encodeURIComponent(entityKey)}`);
}

export function listAgentMessages(sessionId: string, afterSeq = 0) {
  return apiFetch<AgentMessage[]>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/messages?after_seq=${afterSeq}&limit=50`,
  );
}

export function sendAgentMessage(
  sessionId: string,
  clientMessageId: string,
  content: string,
  pagePath = "",
) {
  return apiFetch<AgentChatTurn>(`${path}/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ client_message_id: clientMessageId, content, page_path: pagePath }),
  });
}

export function listAgentInsights(sessionId: string) {
  return apiFetch<AgentInsight[]>(`${path}/sessions/${encodeURIComponent(sessionId)}/insights`);
}

export function changeAgentInsight(
  sessionId: string,
  insightId: string,
  action: "confirm" | "reject",
) {
  return apiFetch<AgentInsight>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/insights/${encodeURIComponent(insightId)}/${action}`,
    { method: "POST" },
  );
}

export function getAgentSessionSummary(sessionId: string) {
  return apiFetch<AgentSessionSummary>(`${path}/sessions/${encodeURIComponent(sessionId)}/summary`);
}

export function generateModusOperandiDraft(
  sessionId: string,
  clientMessageId: string,
  operation: "create" | "update",
  targetId?: string,
) {
  return apiFetch<ModusOperandiDraft>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/modus-operandi-drafts`,
    {
      method: "POST",
      body: JSON.stringify({
        client_message_id: clientMessageId,
        operation,
        ...(targetId ? { target_id: targetId } : {}),
      }),
    },
  );
}

export function confirmModusOperandiDraft(sessionId: string, packageId: string, itemId: string) {
  return apiFetch<AgentConfirmation>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/modus-operandi-drafts/${encodeURIComponent(packageId)}/confirm`,
    { method: "POST", body: JSON.stringify({ item_id: itemId }) },
  );
}

export function generateFlagDraft(
  sessionId: string,
  clientMessageId: string,
  operation: "create" | "update",
  targetId?: string,
) {
  return apiFetch<AgentLibraryDraft>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/flag-drafts`,
    {
      method: "POST",
      body: JSON.stringify({
        client_message_id: clientMessageId,
        operation,
        ...(targetId ? { target_id: targetId } : {}),
      }),
    },
  );
}

export function confirmFlagDraft(sessionId: string, packageId: string, itemId: string) {
  return apiFetch<AgentConfirmation>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/flag-drafts/${encodeURIComponent(packageId)}/confirm`,
    { method: "POST", body: JSON.stringify({ item_id: itemId }) },
  );
}

export function generateSimilarCaseDraft(
  sessionId: string,
  clientMessageId: string,
  operation: "create" | "update",
  targetId?: string,
) {
  return apiFetch<AgentLibraryDraft>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/similar-case-drafts`,
    {
      method: "POST",
      body: JSON.stringify({
        client_message_id: clientMessageId,
        operation,
        ...(targetId ? { target_id: targetId } : {}),
      }),
    },
  );
}

export function confirmSimilarCaseDraft(sessionId: string, packageId: string, itemId: string) {
  return apiFetch<AgentConfirmation>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/similar-case-drafts/${encodeURIComponent(packageId)}/confirm`,
    { method: "POST", body: JSON.stringify({ item_id: itemId }) },
  );
}

function generateLibraryDraft(
  sessionId: string,
  kind: "taxonomy" | "watchlist",
  clientMessageId: string,
  operation: "create" | "update",
  targetId?: string,
) {
  return apiFetch<AgentLibraryDraft>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/${kind}-drafts`,
    {
      method: "POST",
      body: JSON.stringify({
        client_message_id: clientMessageId,
        operation,
        ...(targetId ? { target_id: targetId } : {}),
      }),
    },
  );
}

export function generateTaxonomyDraft(
  sessionId: string,
  clientMessageId: string,
  operation: "create" | "update",
  targetId?: string,
) {
  return generateLibraryDraft(sessionId, "taxonomy", clientMessageId, operation, targetId);
}

export function confirmTaxonomyDraft(sessionId: string, packageId: string, itemId: string) {
  return apiFetch<AgentConfirmation>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/taxonomy-drafts/${encodeURIComponent(packageId)}/confirm`,
    { method: "POST", body: JSON.stringify({ item_id: itemId }) },
  );
}

export function generateWatchlistDraft(
  sessionId: string,
  clientMessageId: string,
  operation: "create" | "update",
  targetId?: string,
) {
  return generateLibraryDraft(sessionId, "watchlist", clientMessageId, operation, targetId);
}

export function confirmWatchlistDraft(sessionId: string, packageId: string, itemId: string) {
  return apiFetch<AgentConfirmation>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/watchlist-drafts/${encodeURIComponent(packageId)}/confirm`,
    { method: "POST", body: JSON.stringify({ item_id: itemId }) },
  );
}

export function validateAgentExperiment(sessionId: string, experimentId: string) {
  return apiFetch<RetrospectiveValidation>("/api/v0/agent/releases/retrospective-validations", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, experiment_id: experimentId }),
  });
}

export function requestAgentRelease(data: {
  validation_id: string;
  title: string;
  reason: string;
}) {
  return apiFetch<AgentRelease>("/api/v0/agent/releases", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listAgentReleases() {
  return apiFetch<AgentRelease[]>("/api/v0/agent/releases");
}

export function transitionAgentRelease(
  releaseId: string,
  action: "submit" | "approve" | "advance" | "rollback",
  data: { expected_version: number; reason: string; target_stage?: string },
) {
  return apiFetch<AgentRelease>(
    `/api/v0/agent/releases/${encodeURIComponent(releaseId)}/${action}`,
    { method: "POST", body: JSON.stringify(data) },
  );
}
