import type { ApiKeyRecord, CloudStore } from "./types.js";
/** Stripe subscription statuses that force key suspension (contract). */
export declare const SUSPEND_STATUSES: Set<string>;
/** Statuses that (re)activate an org's keys. */
export declare const UNSUSPEND_STATUSES: Set<string>;
export declare function createMemoryStore(seedKeys?: ApiKeyRecord[]): CloudStore;
export declare function parseSeedKeys(raw: string | undefined): ApiKeyRecord[];
