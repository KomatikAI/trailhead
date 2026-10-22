import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/cloud/[[...route]]/route";

describe("mounted Cloud API", () => {
  it("redirects its dashboard to the Next dashboard rather than a missing static file", async () => {
    const response = await GET(new Request("http://localhost/api/cloud/dashboard"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard");
  });
  it("serves health while retaining authorization on evaluation ingest", async () => {
    const health = await GET(new Request("http://localhost/api/cloud/health"));
    expect(health.status).toBe(200);
    const ingest = await POST(
      new Request("http://localhost/api/cloud/v1/evaluations", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(ingest.status).toBe(401);
  });
});
