// Org catalog index loader for the contract_integrity detector (ADR-010).
//
// The index is a JSON file — `{ "version": 1, "entities": ["identity", ...] }` —
// listing every Backstage entity name published across the org's
// catalog-info.yaml files. It lets contract_integrity resolve CROSS-REPO
// references (a satellite consuming an API another repo publishes). Generate it
// with `scripts/build-catalog-index.mjs` and point `.trailhead.yml` at it via
// `submission.contract_integrity.catalog_index_path`.

import { readFileSync } from "node:fs";

export interface CatalogIndex {
  version?: number;
  generated?: string;
  entities: string[];
  /** entity name → "owner/repo" that declares it (for the cross-repo opener). */
  owners?: Record<string, string>;
}

/** Parse a catalog-index JSON string into the list of entity names. */
export function parseCatalogIndex(raw: string): string[] {
  const parsed = JSON.parse(raw) as Partial<CatalogIndex>;
  if (!Array.isArray(parsed.entities)) return [];
  return parsed.entities.filter(
    (e): e is string => typeof e === "string" && e.length > 0,
  );
}

/** Parse the `owners` map (entity → "owner/repo") from a catalog-index JSON string. */
export function parseCatalogOwners(raw: string): Record<string, string> {
  const parsed = JSON.parse(raw) as Partial<CatalogIndex>;
  const owners = parsed.owners;
  if (!owners || typeof owners !== "object") return {};
  const out: Record<string, string> = {};
  for (const [name, repo] of Object.entries(owners)) {
    if (typeof name === "string" && name && typeof repo === "string" && repo) {
      out[name] = repo;
    }
  }
  return out;
}

/** Read + parse a catalog index file. Throws on read/parse failure (caller decides). */
export function loadCatalogIndex(path: string): string[] {
  return parseCatalogIndex(readFileSync(path, "utf8"));
}

/** Read + parse the owners map from a catalog index file. Throws on read/parse failure. */
export function loadCatalogOwners(path: string): Record<string, string> {
  return parseCatalogOwners(readFileSync(path, "utf8"));
}
