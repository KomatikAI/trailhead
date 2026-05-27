import { describe, it, expect } from "vitest";
import {
  circleCiJobsToManifestJobs,
  mapCircleCiJobStatus,
} from "../ci-adapters/circleci.js";
import { gitLabJobsToManifestJobs, mapGitLabJobStatus } from "../ci-adapters/gitlab.js";

describe("GitLab adapter", () => {
  it("maps GitLab job statuses to manifest outcomes", () => {
    expect(mapGitLabJobStatus("success")).toBe("passed");
    expect(mapGitLabJobStatus("failed")).toBe("failed");
    expect(mapGitLabJobStatus("running")).toBe("pending");
  });

  it("converts GitLab jobs to manifest jobs", () => {
    const jobs = gitLabJobsToManifestJobs([
      { name: "rspec", status: "success", web_url: "https://gitlab.example/job/1" },
    ]);
    expect(jobs[0]?.outcome).toBe("passed");
    expect(jobs[0]?.details_url).toContain("gitlab.example");
  });
});

describe("CircleCI adapter", () => {
  it("maps CircleCI job statuses to manifest outcomes", () => {
    expect(mapCircleCiJobStatus("success")).toBe("passed");
    expect(mapCircleCiJobStatus("failed")).toBe("failed");
    expect(mapCircleCiJobStatus("running")).toBe("pending");
  });

  it("converts CircleCI jobs to manifest jobs", () => {
    const jobs = circleCiJobsToManifestJobs([
      { name: "build", status: "success", web_url: "https://circleci.com/job/1" },
    ]);
    expect(jobs[0]?.outcome).toBe("passed");
  });
});
