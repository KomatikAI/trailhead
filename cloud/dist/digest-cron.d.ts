import type { CloudStore } from "./types.js";
export interface DigestCronOptions {
    store: CloudStore;
    intervalHours?: number;
    digestDays?: number;
    /** Bearer token used for internal deliver calls when org keys are not iterated. */
    deliverForOrgIds?: string[];
}
export declare function startDigestCron(options: DigestCronOptions): () => void;
