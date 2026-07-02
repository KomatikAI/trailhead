import { buildCloudFooterLine } from "../cloud-upsell.js";

describe("buildCloudFooterLine", () => {
  it("shows the no-key upsell line when no cloud key is configured", () => {
    const line = buildCloudFooterLine({ hasCloudKey: false, disableUpsell: false });
    expect(line).not.toBeNull();
    expect(line).toContain("wasn't persisted");
    expect(line).toContain("Trailhead Cloud");
    expect(line).toContain("https://trailhead.komatik.xyz/");
    expect(line).toContain("utm_source=action");
    expect(line).toContain("utm_medium=check-summary");
    expect(line).toContain("utm_campaign=cloud-upsell");
    // Exactly one line.
    expect(line?.includes("\n")).toBe(false);
  });

  it("suppresses the no-key upsell line when disable-cloud-upsell is set", () => {
    const line = buildCloudFooterLine({ hasCloudKey: false, disableUpsell: true });
    expect(line).toBeNull();
  });

  it("says nothing when a cloud key is configured and nothing is exceptional", () => {
    const line = buildCloudFooterLine({ hasCloudKey: true, disableUpsell: false });
    expect(line).toBeNull();
  });

  it("shows the soft quota-exceeded line when the org has a key but is over quota", () => {
    const line = buildCloudFooterLine({
      hasCloudKey: true,
      disableUpsell: false,
      quotaExceeded: true,
    });
    expect(line).not.toBeNull();
    expect(line).toContain("Over your plan's monthly evaluations");
    expect(line).toContain("history still stored");
    expect(line).toContain("utm_campaign=quota-upsell");
    expect(line?.includes("\n")).toBe(false);
  });

  it("shows a plain not-stored message and link when suspended (402)", () => {
    const line = buildCloudFooterLine({
      hasCloudKey: true,
      disableUpsell: false,
      suspended: true,
    });
    expect(line).not.toBeNull();
    expect(line).toContain("not stored");
    expect(line).toContain("suspended");
    expect(line).toContain("utm_campaign=suspended-upsell");
    expect(line?.includes("\n")).toBe(false);
  });

  it("shows a plain not-stored message and link when hard-capped (429)", () => {
    const line = buildCloudFooterLine({
      hasCloudKey: true,
      disableUpsell: false,
      hardCapped: true,
    });
    expect(line).not.toBeNull();
    expect(line).toContain("not stored");
    expect(line).toContain("hard usage cap");
    expect(line).toContain("utm_campaign=quota-upsell");
    expect(line?.includes("\n")).toBe(false);
  });

  it("suppresses suspended/hard-capped/quota lines too when disable-cloud-upsell is set", () => {
    expect(
      buildCloudFooterLine({ hasCloudKey: true, disableUpsell: true, suspended: true }),
    ).toBeNull();
    expect(
      buildCloudFooterLine({ hasCloudKey: true, disableUpsell: true, hardCapped: true }),
    ).toBeNull();
    expect(
      buildCloudFooterLine({
        hasCloudKey: true,
        disableUpsell: true,
        quotaExceeded: true,
      }),
    ).toBeNull();
  });

  it("prioritizes suspended over hard-capped and quota-exceeded", () => {
    const line = buildCloudFooterLine({
      hasCloudKey: true,
      disableUpsell: false,
      suspended: true,
      hardCapped: true,
      quotaExceeded: true,
    });
    expect(line).toContain("suspended");
  });
});
