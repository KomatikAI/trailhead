export type FeedbackDisposition = "false_positive" | "true_positive" | "dismissed";
export interface DetectorFeedbackRecord {
    id: string;
    orgId: string;
    detector: string;
    repo?: string;
    disposition: FeedbackDisposition;
    reason?: string;
    evaluationId?: string;
    timestamp: string;
}
export interface DetectorNoiseEntry {
    detector: string;
    total: number;
    falsePositive: number;
    truePositive: number;
    dismissed: number;
    falsePositiveRate: number;
    noisy: boolean;
}
export interface TuningRecommendation {
    detector: string;
    recommendation: string;
    expectedImpact: string;
    confidence: "high" | "medium" | "low";
    falsePositiveRate: number;
    samples: number;
}
export declare function aggregateDetectorNoise(records: DetectorFeedbackRecord[], options?: {
    repo?: string;
    fpThreshold?: number;
}): {
    repo: string | null;
    recordsAnalyzed: number;
    detectors: DetectorNoiseEntry[];
};
export declare function recommendPolicyTuning(records: DetectorFeedbackRecord[], options?: {
    repo?: string;
    falsePositiveThreshold?: number;
}): {
    repo: string | null;
    falsePositiveThreshold: number;
    recommendations: TuningRecommendation[];
    generatedAt: string;
};
export declare function generateTuningYaml(recommendations: TuningRecommendation[], repo?: string): string;
export declare function buildDigestPayload(noise: ReturnType<typeof aggregateDetectorNoise>, orgName: string): {
    subject: string;
    body: string;
    noisyDetectors: DetectorNoiseEntry[];
};
