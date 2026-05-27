import type { CiExternalWebhook } from "./ci-external.js";

export interface StoredCiStatus {
  repo: string;
  commitSha: string;
  payload: CiExternalWebhook;
  receivedAt: string;
}

export class CiStatusStore {
  private readonly entries = new Map<string, StoredCiStatus>();

  constructor(private readonly ttlMs = 7 * 24 * 60 * 60 * 1000) {}

  private key(repo: string, commitSha: string): string {
    return `${repo.toLowerCase()}:${commitSha.toLowerCase()}`;
  }

  put(repo: string, commitSha: string, payload: CiExternalWebhook): StoredCiStatus {
    const entry: StoredCiStatus = {
      repo,
      commitSha,
      payload,
      receivedAt: new Date().toISOString(),
    };
    this.entries.set(this.key(repo, commitSha), entry);
    this.prune();
    return entry;
  }

  get(repo: string, commitSha: string): StoredCiStatus | null {
    const entry = this.entries.get(this.key(repo, commitSha));
    if (!entry) return null;
    if (Date.now() - new Date(entry.receivedAt).getTime() > this.ttlMs) {
      this.entries.delete(this.key(repo, commitSha));
      return null;
    }
    return entry;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now - new Date(entry.receivedAt).getTime() > this.ttlMs) {
        this.entries.delete(key);
      }
    }
  }
}

export const defaultCiStatusStore = new CiStatusStore();
