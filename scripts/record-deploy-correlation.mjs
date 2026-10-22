/** Record an observed successful deployment; a branch push is not deployment evidence. */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function recordDeployment(event, config, { fetchImpl = fetch } = {}) {
  const deployment = event.deployment;
  const status = event.deployment_status;
  const environment = config.environment ?? "production";
  if (
    event.repository?.full_name !== config.repository ||
    !/^[\w.-]+\/[\w.-]+$/.test(config.repository ?? "") ||
    !/^[a-f0-9]{40}$/.test(deployment?.sha ?? "") ||
    deployment?.production_environment !== true ||
    deployment.environment?.toLowerCase() !== environment.toLowerCase() ||
    status?.environment?.toLowerCase() !== environment.toLowerCase() ||
    status?.state !== "success"
  )
    return { recorded: false, reason: "not_successful_production_deployment" };

  const deployedAt = new Date(status.created_at);
  if (typeof status.created_at !== "string" || !Number.isFinite(deployedAt.getTime()))
    throw new Error("invalid_deployment_time");
  const hours =
    config.fallbackHours === undefined || config.fallbackHours === ""
      ? 0
      : Number(config.fallbackHours);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24)
    throw new Error("fallback_window_must_be_0_to_24_hours");
  const origin = new URL(config.storeUrl);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    !["", "/"].includes(origin.pathname) ||
    !config.storeKey
  )
    throw new Error("invalid_store_configuration");
  const endpoint = new URL("/rest/v1/trailhead_evaluations", origin);
  const headers = { apikey: config.storeKey, Authorization: `Bearer ${config.storeKey}` };
  const request = async (url, method, body) => {
    const response = await fetchImpl(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`store_http_${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("invalid_store_response");
    return rows;
  };
  const query = (fallback) => {
    const url = new URL(endpoint);
    url.searchParams.set(
      "select",
      "id,repo_id,commit_sha,gate_decision,release_ready,created_at",
    );
    url.searchParams.set("repo_id", `eq.${config.repository}`);
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", fallback ? "2" : "1");
    url.searchParams.append("created_at", `lte.${deployedAt.toISOString()}`);
    if (fallback)
      url.searchParams.append(
        "created_at",
        `gte.${new Date(deployedAt.getTime() - hours * 3_600_000).toISOString()}`,
      );
    else url.searchParams.set("commit_sha", `eq.${deployment.sha}`);
    return url;
  };
  let rows = await request(query(false), "GET");
  let match = "exact_sha";
  if (!rows.length && hours > 0) {
    rows = await request(query(true), "GET");
    match = "time_window";
  }
  if (rows.length !== 1)
    return { recorded: false, reason: rows.length ? "ambiguous_match" : "no_evaluation" };
  const row = rows[0];
  const evaluatedAt = Date.parse(row?.created_at);
  if (
    !/^[\w-]{1,128}$/.test(row?.id ?? "") ||
    row.repo_id !== config.repository ||
    !/^[a-f0-9]{40}$/.test(row.commit_sha ?? "") ||
    (match === "exact_sha" && row.commit_sha !== deployment.sha) ||
    !Number.isFinite(evaluatedAt) ||
    evaluatedAt > deployedAt.getTime() ||
    (match === "time_window" && evaluatedAt < deployedAt.getTime() - hours * 3_600_000)
  )
    throw new Error("evaluation_identity_mismatch");
  if (
    !["allow", "warn"].includes(row.gate_decision) ||
    (row.release_ready !== true && row.release_ready !== null)
  )
    return { recorded: false, reason: "evaluation_not_ready" };
  const patch = new URL(endpoint);
  patch.searchParams.set("id", `eq.${row.id}`);
  patch.searchParams.set("repo_id", `eq.${config.repository}`);
  patch.searchParams.set("commit_sha", `eq.${row.commit_sha}`);
  patch.searchParams.set("gate_decision", "in.(allow,warn)");
  patch.searchParams.set("or", "(release_ready.is.null,release_ready.eq.true)");
  // A delayed older success must not overwrite a later deployment outcome.
  patch.searchParams.set(
    "and",
    `(or(deployed_at.is.null,deployed_at.lte.${deployedAt.toISOString()}))`,
  );
  patch.searchParams.set("select", "id");
  const updated = await request(patch, "PATCH", {
    deploy_outcome: "success",
    deployed_at: deployedAt.toISOString(),
  });
  return updated.length === 1 && updated[0]?.id === row.id
    ? { recorded: true, match }
    : { recorded: false, reason: "evaluation_changed" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.env.GITHUB_EVENT_NAME !== "deployment_status")
      throw new Error("deployment_status_event_required");
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
    const result = await recordDeployment(event, {
      repository: process.env.GITHUB_REPOSITORY,
      environment: process.env.TRAILHEAD_PRODUCTION_ENVIRONMENT || "production",
      fallbackHours: process.env.TRAILHEAD_DEPLOY_MATCH_WINDOW_HOURS,
      storeUrl: process.env.SUPABASE_URL,
      storeKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
    console.log(JSON.stringify(result));
  } catch {
    // Store failures remain non-blocking; never print response bodies or credentials.
    console.warn(
      "::warning::Deployment correlation unavailable; dashboard deployment history is incomplete.",
    );
  }
}
