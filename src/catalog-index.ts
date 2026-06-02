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
}

/** Parse a catalog-index JSON string into the list of entity names. */
export function parseCatalogIndex(raw: string): string[] {
  const parsed = JSON.parse(raw) as Partial<CatalogIndex>;
  if (!Array.isArray(parsed.entities)) return [];
  return parsed.entities.filter(
    (e): e is string => typeof e === "string" && e.length > 0,
  );
}

/** Read + parse a catalog index file. Throws on read/parse failure (caller decides). */
export function loadCatalogIndex(path: string): string[] {
  return parseCatalogIndex(readFileSync(path, "utf8"));
}
