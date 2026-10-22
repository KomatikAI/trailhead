export function mapCircleCiJobStatus(status) {
    switch (status) {
        case "success":
            return "passed";
        case "failed":
        case "failing":
            return "failed";
        case "canceled":
        case "cancelled":
            return "cancelled";
        case "skipped":
            return "skipped";
        case "not_run":
            return "pending";
        case "running":
        case "queued":
        case "on_hold":
        case "blocked":
            return "pending";
        default:
            return "pending";
    }
}
export function circleCiJobsToManifestJobs(jobs) {
    return jobs.map((job) => ({
        name: job.name,
        outcome: mapCircleCiJobStatus(job.status),
        details_url: job.web_url,
    }));
}
function revisionMatches(revision, commitSha) {
    return /^[a-f0-9]{40}$/.test(commitSha) && revision === commitSha;
}
export async function fetchCircleCiManifest(options) {
    const base = (options.apiUrl ?? "https://circleci.com/api/v2").replace(/\/$/, "");
    const slug = encodeURIComponent(options.projectSlug);
    const headers = {
        "Circle-Token": options.token,
        Accept: "application/json",
    };
    if (!/^[a-f0-9]{40}$/.test(options.commitSha))
        return null;
    try {
        const origin = new URL(base);
        if (origin.protocol !== "https:" || origin.username || origin.password)
            return null;
        const list = async (path, stopWhen) => {
            const items = [];
            const seen = new Set();
            let token;
            for (let page = 0; page < 10; page++) {
                const url = new URL(`${base}${path}`);
                if (token)
                    url.searchParams.set("page-token", token);
                const response = await fetch(url, {
                    headers,
                    redirect: "error",
                    signal: AbortSignal.timeout(10_000),
                });
                if (!response.ok)
                    throw new Error("CircleCI request failed");
                const data = (await response.json());
                if (!Array.isArray(data.items))
                    throw new Error("Invalid CircleCI page");
                items.push(...data.items);
                if (stopWhen?.(items))
                    return items;
                if (!data.next_page_token)
                    return items;
                if (typeof data.next_page_token !== "string" || seen.has(data.next_page_token))
                    throw new Error("Invalid CircleCI pagination");
                token = data.next_page_token;
                seen.add(token);
            }
            throw new Error("CircleCI pagination limit");
        };
        const pipelines = await list(`/project/${slug}/pipeline`, (items) => items.some((item) => revisionMatches(item.vcs?.revision, options.commitSha)));
        const pipeline = pipelines.find((item) => revisionMatches(item.vcs?.revision, options.commitSha));
        if (!pipeline?.id)
            return null;
        const workflows = await list(`/pipeline/${encodeURIComponent(pipeline.id)}/workflow`);
        if (!workflows.length)
            return null;
        const jobs = new Map();
        const severity = {
            passed: 0,
            skipped: 1,
            ran: 2,
            pending: 3,
            cancelled: 4,
            failed: 5,
        };
        // A rerun supersedes older instances of that same workflow. If timestamps
        // are absent/invalid retain both conservatively instead of guessing.
        const currentWorkflows = workflows.filter((workflow) => !workflows.some((other) => other.name &&
            other.name === workflow.name &&
            Date.parse(other.created_at ?? "") > Date.parse(workflow.created_at ?? "")));
        for (const workflow of currentWorkflows) {
            if (!workflow.id)
                return null;
            const workflowJobs = await list(`/workflow/${encodeURIComponent(workflow.id)}/job`);
            if (!workflowJobs.length ||
                workflowJobs.some((job) => !job ||
                    typeof job.name !== "string" ||
                    !job.name ||
                    typeof job.status !== "string"))
                return null;
            for (const job of circleCiJobsToManifestJobs(workflowJobs)) {
                if (!job.name)
                    return null;
                const key = job.name.toLowerCase();
                const prior = jobs.get(key);
                if (!prior || severity[job.outcome] > severity[prior.outcome])
                    jobs.set(key, job);
            }
        }
        return {
            schema_version: 1,
            commit_sha: options.commitSha,
            workflow: `circleci:${pipeline.id}`,
            jobs: [...jobs.values()],
        };
    }
    catch {
        return null;
    }
}
