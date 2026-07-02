import type { Pool } from "pg";
export declare const MIGRATIONS_DIR: string;
export interface MigrationResult {
    applied: string[];
    skipped: string[];
    alreadyApplied: string[];
}
export declare function runMigrations(pool: Pool, opts?: {
    log?: (msg: string) => void;
    migrationsDir?: string;
}): Promise<MigrationResult>;
