import { Hono } from "hono";
import type { ApiKeyRecord, CloudStore } from "./types.js";
export interface CloudAppOptions {
    store?: CloudStore;
    seedKeys?: ApiKeyRecord[];
}
export declare function createCloudApp(options?: CloudAppOptions): Hono;
export declare function createDefaultCloudApp(): Hono;
declare module "hono" {
    interface ContextVariableMap {
        orgId: string;
        orgName: string;
        apiKey: string;
    }
}
