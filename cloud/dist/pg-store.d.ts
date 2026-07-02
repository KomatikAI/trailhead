import type { Pool } from "pg";
import type { CloudStore } from "./types.js";
export declare function createPgStore(pool: Pool): CloudStore;
