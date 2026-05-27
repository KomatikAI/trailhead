export class CiStatusStore {
    ttlMs;
    entries = new Map();
    constructor(ttlMs = 7 * 24 * 60 * 60 * 1000) {
        this.ttlMs = ttlMs;
    }
    key(repo, commitSha) {
        return `${repo.toLowerCase()}:${commitSha.toLowerCase()}`;
    }
    put(repo, commitSha, payload) {
        const entry = {
            repo,
            commitSha,
            payload,
            receivedAt: new Date().toISOString(),
        };
        this.entries.set(this.key(repo, commitSha), entry);
        this.prune();
        return entry;
    }
    get(repo, commitSha) {
        const entry = this.entries.get(this.key(repo, commitSha));
        if (!entry)
            return null;
        if (Date.now() - new Date(entry.receivedAt).getTime() > this.ttlMs) {
            this.entries.delete(this.key(repo, commitSha));
            return null;
        }
        return entry;
    }
    prune() {
        const now = Date.now();
        for (const [key, entry] of this.entries) {
            if (now - new Date(entry.receivedAt).getTime() > this.ttlMs) {
                this.entries.delete(key);
            }
        }
    }
}
export const defaultCiStatusStore = new CiStatusStore();
//# sourceMappingURL=ci-status-store.js.map