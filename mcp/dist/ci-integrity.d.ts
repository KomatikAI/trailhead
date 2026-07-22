export interface CiIntegrityFile {
    filename: string;
    additions?: number;
    deletions?: number;
    patch?: string;
}
export interface CiIntegrityResult {
    score: number;
    blockingPatterns: string[];
    warningSignals: string[];
}
/** Detect newly introduced CI bypasses, never unchanged or deleted context. */
export declare function detectCiIntegrity(files: CiIntegrityFile[]): CiIntegrityResult;
