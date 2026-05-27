export declare function isCloudFeedbackEnabled(): boolean;
export declare function postCloudFeedback(payload: {
    detector: string;
    disposition: "false_positive" | "true_positive" | "dismissed";
    repo?: string;
    reason?: string;
    evaluationId?: string;
}): Promise<{
    stored: boolean;
    totalRecords?: number;
} | null>;
export declare function fetchCloudDetectorNoise(repo?: string): Promise<unknown | null>;
export declare function fetchCloudPolicyTuning(repo?: string, falsePositiveThreshold?: number): Promise<unknown | null>;
export declare function cloudFeedbackHint(): string;
