export interface DeployOutcome {
    deploymentId: string;
    environment: string;
    status: "success" | "failure" | "cancelled";
    durationMs?: number;
    url?: string;
    timestamp: string;
    source: "vercel" | "generic";
}
export interface RollbackResult {
    triggered: boolean;
    strategy: string;
    targetRef?: string;
    detail: string;
    timestamp: string;
}
export declare function parseVercelPayload(raw: unknown): DeployOutcome | null;
export declare function parseGenericPayload(raw: unknown): DeployOutcome | null;
export declare function executeRollback(outcome: DeployOutcome, githubToken?: string, repoFullName?: string): Promise<RollbackResult>;
