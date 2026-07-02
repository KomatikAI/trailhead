export function aggregateDetectorNoise(records, options = {}) {
    const fpThreshold = options.fpThreshold ?? 15;
    const filtered = options.repo
        ? records.filter((r) => r.repo === options.repo)
        : records;
    const byDetector = new Map();
    for (const record of filtered) {
        const entry = byDetector.get(record.detector) ?? {
            total: 0,
            falsePositive: 0,
            truePositive: 0,
            dismissed: 0,
        };
        entry.total += 1;
        if (record.disposition === "false_positive")
            entry.falsePositive += 1;
        if (record.disposition === "true_positive")
            entry.truePositive += 1;
        if (record.disposition === "dismissed")
            entry.dismissed += 1;
        byDetector.set(record.detector, entry);
    }
    const detectors = [...byDetector.entries()]
        .map(([detector, entry]) => {
        const falsePositiveRate = entry.total > 0 ? Math.round((entry.falsePositive / entry.total) * 1000) / 10 : 0;
        return {
            detector,
            ...entry,
            falsePositiveRate,
            noisy: falsePositiveRate > fpThreshold,
        };
    })
        .sort((a, b) => b.falsePositiveRate - a.falsePositiveRate);
    return {
        repo: options.repo ?? null,
        recordsAnalyzed: filtered.length,
        detectors,
    };
}
export function recommendPolicyTuning(records, options = {}) {
    const falsePositiveThreshold = options.falsePositiveThreshold ?? 15;
    const filtered = options.repo
        ? records.filter((r) => r.repo === options.repo)
        : records;
    const detectorStats = new Map();
    for (const record of filtered) {
        const entry = detectorStats.get(record.detector) ?? { total: 0, falsePositive: 0 };
        entry.total += 1;
        if (record.disposition === "false_positive")
            entry.falsePositive += 1;
        detectorStats.set(record.detector, entry);
    }
    const recommendations = [...detectorStats.entries()]
        .map(([detector, stat]) => ({
        detector,
        samples: stat.total,
        falsePositiveRate: stat.total > 0 ? Math.round((stat.falsePositive / stat.total) * 1000) / 10 : 0,
    }))
        .filter((s) => s.falsePositiveRate > falsePositiveThreshold)
        .map((s) => ({
        detector: s.detector,
        samples: s.samples,
        falsePositiveRate: s.falsePositiveRate,
        recommendation: `Reduce sensitivity or switch ${s.detector} to warn mode for this repo`,
        expectedImpact: "Lower review noise while preserving detector visibility",
        confidence: (s.samples >= 20 ? "high" : s.samples >= 8 ? "medium" : "low"),
    }));
    return {
        repo: options.repo ?? null,
        falsePositiveThreshold,
        recommendations,
        generatedAt: new Date().toISOString(),
    };
}
export function generateTuningYaml(recommendations, repo) {
    const lines = [
        "# Trailhead policy tuning proposal",
        `# Generated for ${repo ?? "all repos"}`,
        "schema_version: 2",
        "",
        "detectors:",
    ];
    if (recommendations.length === 0) {
        lines.push("  # No noisy detectors above threshold");
        return lines.join("\n");
    }
    for (const rec of recommendations) {
        lines.push(`  ${rec.detector}:`);
        lines.push("    mode: warn");
        lines.push(`    # FP rate ${rec.falsePositiveRate}% (${rec.confidence} confidence)`);
    }
    lines.push("");
    lines.push("thresholds:");
    lines.push("  risk: 70  # review after detector tuning");
    return lines.join("\n");
}
export function buildDigestPayload(noise, orgName) {
    const noisy = noise.detectors.filter((d) => d.noisy);
    const subject = `[Trailhead] ${noisy.length} noisy detector(s) — ${orgName}`;
    const body = noisy.length === 0
        ? "No detectors exceeded the false-positive threshold this period."
        : noisy
            .map((d) => `- ${d.detector}: ${d.falsePositiveRate}% FP (${d.falsePositive}/${d.total} samples)`)
            .join("\n");
    return { subject, body, noisyDetectors: noisy };
}
