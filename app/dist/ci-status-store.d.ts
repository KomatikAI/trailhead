import type { CiExternalWebhook } from "./ci-external.js";
export interface StoredCiStatus {
    repo: string;
    commitSha: string;
    payload: CiExternalWebhook;
    receivedAt: string;
}
export declare class CiStatusStore {
    private readonly ttlMs;
    private readonly entries;
    constructor(ttlMs?: number);
    private key;
    put(repo: string, commitSha: string, payload: CiExternalWebhook): StoredCiStatus;
    get(repo: string, commitSha: string): StoredCiStatus | null;
    private prune;
}
export declare const defaultCiStatusStore: CiStatusStore;
