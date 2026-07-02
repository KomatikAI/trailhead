import { evaluateQuota, generateApiKey, hashApiKey, maskApiKey, monthKey, PLANS, } from "./billing.js";
import { SUSPEND_STATUSES, UNSUSPEND_STATUSES } from "./store.js";
function iso(value) {
    if (value == null)
        return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function agentProvenanceOf(payload) {
    if (typeof payload.agentProvenanceId === "string")
        return payload.agentProvenanceId;
    const snake = payload.agent_provenance_id;
    return typeof snake === "string" ? snake : undefined;
}
function rowToEvaluation(payload, receivedAt) {
    return {
        ...payload,
        orgId: payload.orgId,
        receivedAt: iso(receivedAt),
        agentProvenanceId: agentProvenanceOf(payload),
    };
}
function mapSubscription(row) {
    return {
        id: row.id,
        orgId: row.org_id,
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        plan: row.plan,
        status: row.status,
        currentPeriodEnd: iso(row.current_period_end),
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
    };
}
function mapSettings(row) {
    if (!row)
        return { plan: "free", seats: 1, seatsUsed: 1 };
    return {
        plan: row.plan,
        seats: Number(row.seats),
        seatsUsed: Number(row.seats_used),
        sso: row.sso ?? undefined,
        digest: row.digest ?? undefined,
        tuning: row.tuning ?? undefined,
    };
}
export function createPgStore(pool) {
    async function tx(fn) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const result = await fn(client);
            await client.query("COMMIT");
            return result;
        }
        catch (err) {
            await client.query("ROLLBACK").catch(() => undefined);
            throw err;
        }
        finally {
            client.release();
        }
    }
    async function applyStatusToKeys(client, orgId, status) {
        if (SUSPEND_STATUSES.has(status)) {
            await client.query(`UPDATE api_keys SET suspended = true WHERE org_id = $1`, [
                orgId,
            ]);
        }
        else if (UNSUSPEND_STATUSES.has(status)) {
            await client.query(`UPDATE api_keys SET suspended = false WHERE org_id = $1`, [
                orgId,
            ]);
        }
    }
    async function readSettings(orgId) {
        const { rows } = await pool.query(`SELECT plan, seats, seats_used, sso, digest, tuning
         FROM org_settings WHERE org_id = $1`, [orgId]);
        return mapSettings(rows[0]);
    }
    async function readUsage(orgId) {
        const { rows } = await pool.query(`SELECT evals FROM usage_counters WHERE org_id = $1 AND month_key = $2`, [orgId, monthKey()]);
        return rows[0] ? Number(rows[0].evals) : 0;
    }
    return {
        async getOrgForKey(apiKey) {
            const { rows } = await pool.query(`SELECT k.id AS key_id, k.org_id, k.label, k.suspended, o.name AS org_name
           FROM api_keys k JOIN orgs o ON o.id = k.org_id
          WHERE k.key_hash = $1 AND k.revoked_at IS NULL`, [hashApiKey(apiKey)]);
            const row = rows[0];
            if (!row)
                return null;
            return {
                keyId: row.key_id,
                key: "",
                orgId: row.org_id,
                orgName: row.org_name,
                label: row.label ?? undefined,
                suspended: Boolean(row.suspended),
            };
        },
        async getOrgSettings(orgId) {
            return readSettings(orgId);
        },
        async updateOrgSettings(orgId, patch) {
            const current = await readSettings(orgId);
            const next = {
                ...current,
                ...patch,
                digest: patch.digest ? { ...current.digest, ...patch.digest } : current.digest,
                sso: patch.sso ? { ...current.sso, ...patch.sso } : current.sso,
            };
            await pool.query(`INSERT INTO org_settings (org_id, plan, seats, seats_used, sso, digest, tuning, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (org_id) DO UPDATE
             SET plan = EXCLUDED.plan,
                 seats = EXCLUDED.seats,
                 seats_used = EXCLUDED.seats_used,
                 sso = EXCLUDED.sso,
                 digest = EXCLUDED.digest,
                 tuning = EXCLUDED.tuning,
                 updated_at = now()`, [
                orgId,
                next.plan,
                next.seats,
                next.seatsUsed,
                next.sso ? JSON.stringify(next.sso) : null,
                next.digest ? JSON.stringify(next.digest) : null,
                next.tuning ? JSON.stringify(next.tuning) : null,
            ]);
            return next;
        },
        async getQuota(orgId) {
            const settings = await readSettings(orgId);
            const used = await readUsage(orgId);
            const limit = PLANS[settings.plan].evaluationsPerMonth;
            return { plan: settings.plan, limit, used, remaining: Math.max(0, limit - used) };
        },
        async ingestEvaluation(orgId, payload, idempotencyKey) {
            const idem = idempotencyKey ?? payload.id;
            return tx(async (client) => {
                const dup = await client.query(`SELECT e.payload, e.received_at
             FROM idempotency_keys i
             JOIN evaluations e ON e.org_id = i.org_id AND e.id = i.evaluation_id
            WHERE i.org_id = $1 AND i.idem_key = $2`, [orgId, idem]);
                if (dup.rows[0]) {
                    const p = dup.rows[0].payload;
                    p.orgId = orgId;
                    return {
                        created: false,
                        evaluation: rowToEvaluation(p, dup.rows[0].received_at),
                    };
                }
                const settingsRes = await client.query(`SELECT plan FROM org_settings WHERE org_id = $1`, [orgId]);
                const plan = settingsRes.rows[0]?.plan ?? "free";
                const usageRes = await client.query(`SELECT evals FROM usage_counters WHERE org_id = $1 AND month_key = $2`, [orgId, monthKey()]);
                const used = usageRes.rows[0] ? Number(usageRes.rows[0].evals) : 0;
                const quota = evaluateQuota(plan, used);
                if (!quota.store) {
                    const evaluation = { ...payload, orgId };
                    return {
                        created: false,
                        evaluation,
                        quotaExceeded: quota.overQuota,
                        hardLimited: quota.hardLimited,
                    };
                }
                const mk = monthKey();
                const stored = { ...payload, orgId };
                const inserted = await client.query(`INSERT INTO evaluations
             (org_id, id, repo_id, pr_number, gate_decision, risk_score, health_score, payload, month_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (org_id, id) DO NOTHING
           RETURNING received_at`, [
                    orgId,
                    payload.id,
                    payload.repoId,
                    payload.prNumber ?? null,
                    payload.gateDecision,
                    payload.riskScore,
                    payload.healthScore,
                    JSON.stringify(stored),
                    mk,
                ]);
                let receivedAt;
                if (inserted.rows[0]) {
                    receivedAt = inserted.rows[0].received_at;
                }
                else {
                    const existing = await client.query(`SELECT received_at FROM evaluations WHERE org_id = $1 AND id = $2`, [orgId, payload.id]);
                    receivedAt = existing.rows[0].received_at;
                }
                await client.query(`INSERT INTO idempotency_keys (org_id, idem_key, evaluation_id)
             VALUES ($1, $2, $3) ON CONFLICT (org_id, idem_key) DO NOTHING`, [orgId, idem, payload.id]);
                await client.query(`INSERT INTO usage_counters (org_id, month_key, evals)
             VALUES ($1, $2, 1)
           ON CONFLICT (org_id, month_key) DO UPDATE
             SET evals = usage_counters.evals + 1`, [orgId, mk]);
                return {
                    created: true,
                    evaluation: rowToEvaluation(stored, receivedAt),
                    quotaExceeded: quota.overQuota,
                };
            });
        },
        async recordDeployEvent(orgId, payload) {
            await pool.query(`INSERT INTO deploy_events (org_id, payload) VALUES ($1, $2)`, [
                orgId,
                JSON.stringify(payload),
            ]);
        },
        async recordFeedback(record) {
            await pool.query(`INSERT INTO detector_feedback (org_id, record) VALUES ($1, $2)`, [
                record.orgId,
                JSON.stringify(record),
            ]);
            return record;
        },
        async listFeedback(orgId, repoId) {
            const { rows } = repoId
                ? await pool.query(`SELECT record FROM detector_feedback
              WHERE org_id = $1 AND record->>'repo' = $2 ORDER BY created_at ASC`, [orgId, repoId])
                : await pool.query(`SELECT record FROM detector_feedback WHERE org_id = $1 ORDER BY created_at ASC`, [orgId]);
            return rows.map((r) => r.record);
        },
        async listOrgs() {
            const { rows } = await pool.query(`SELECT id, name, created_at FROM orgs ORDER BY name ASC`);
            return rows.map((r) => ({
                id: r.id,
                name: r.name,
                createdAt: iso(r.created_at),
            }));
        },
        async listRepos(orgId) {
            const { rows } = await pool.query(`SELECT repo_id,
                COUNT(*)::int AS cnt,
                MIN(received_at) AS first_seen,
                MAX(received_at) AS last_eval
           FROM evaluations WHERE org_id = $1
          GROUP BY repo_id ORDER BY repo_id ASC`, [orgId]);
            return rows.map((r) => ({
                id: `${orgId}:${r.repo_id}`,
                orgId,
                fullName: r.repo_id,
                firstSeenAt: iso(r.first_seen),
                lastEvaluationAt: iso(r.last_eval),
                evaluationCount: Number(r.cnt),
            }));
        },
        async listEvaluations(orgId, repoId, limit = 100, prNumber) {
            const conds = ["org_id = $1"];
            const params = [orgId];
            if (repoId) {
                params.push(repoId);
                conds.push(`repo_id = $${params.length}`);
            }
            if (prNumber !== undefined) {
                params.push(prNumber);
                conds.push(`pr_number = $${params.length}`);
            }
            params.push(limit);
            const { rows } = await pool.query(`SELECT payload, received_at FROM evaluations
          WHERE ${conds.join(" AND ")}
          ORDER BY received_at DESC LIMIT $${params.length}`, params);
            return rows.map((r) => {
                r.payload.orgId = orgId;
                return rowToEvaluation(r.payload, r.received_at);
            });
        },
        async getEvaluation(orgId, id) {
            const { rows } = await pool.query(`SELECT payload, received_at FROM evaluations WHERE org_id = $1 AND id = $2`, [orgId, id]);
            if (!rows[0])
                return null;
            rows[0].payload.orgId = orgId;
            return rowToEvaluation(rows[0].payload, rows[0].received_at);
        },
        async listAllEvaluations(orgId) {
            const { rows } = await pool.query(`SELECT payload, received_at FROM evaluations
          WHERE org_id = $1 ORDER BY received_at DESC`, [orgId]);
            return rows.map((r) => {
                r.payload.orgId = orgId;
                return rowToEvaluation(r.payload, r.received_at);
            });
        },
        async listDeployEvents(orgId) {
            const { rows } = await pool.query(`SELECT payload FROM deploy_events WHERE org_id = $1 ORDER BY created_at ASC`, [orgId]);
            return rows.map((r) => ({ orgId, payload: r.payload }));
        },
        async listManagedKeys(orgId) {
            const { rows } = await pool.query(`SELECT id, label, key_preview, created_at, revoked_at
           FROM api_keys WHERE org_id = $1 AND revoked_at IS NULL
          ORDER BY created_at DESC`, [orgId]);
            return rows.map((r) => ({
                id: r.id,
                orgId,
                key: "",
                label: r.label ?? "API key",
                keyPreview: r.key_preview,
                createdAt: iso(r.created_at),
                revokedAt: iso(r.revoked_at),
            }));
        },
        async createApiKey(orgId, label) {
            const settings = await readSettings(orgId);
            if (!settings.plan || settings.plan === "free") {
                throw new Error("API key provisioning requires Pro or Team plan");
            }
            const secret = generateApiKey();
            const { rows } = await pool.query(`INSERT INTO api_keys (org_id, key_hash, key_preview, label)
             VALUES ($1, $2, $3, $4)
           RETURNING id, created_at`, [orgId, hashApiKey(secret), maskApiKey(secret), label ?? "API key"]);
            return {
                secret,
                key: {
                    id: rows[0].id,
                    orgId,
                    key: "",
                    label: label ?? "API key",
                    keyPreview: maskApiKey(secret),
                    createdAt: iso(rows[0].created_at),
                    revokedAt: null,
                },
            };
        },
        async revokeApiKey(orgId, keyId) {
            const res = await pool.query(`UPDATE api_keys SET revoked_at = now()
          WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL`, [keyId, orgId]);
            return (res.rowCount ?? 0) > 0;
        },
        async listDetectorDowngrades(orgId) {
            const { rows } = await pool.query(`SELECT record FROM detector_downgrades WHERE org_id = $1 ORDER BY detector ASC`, [orgId]);
            return rows.map((r) => r.record);
        },
        async recordDetectorDowngrade(orgId, record) {
            await pool.query(`INSERT INTO detector_downgrades (org_id, detector, record)
             VALUES ($1, $2, $3)
           ON CONFLICT (org_id, detector) DO UPDATE
             SET record = EXCLUDED.record, updated_at = now()`, [orgId, record.detectorCode, JSON.stringify(record)]);
            return record;
        },
        async revertDetectorDowngrade(orgId, detectorCode, revertedBy) {
            return tx(async (client) => {
                const { rows } = await client.query(`SELECT record FROM detector_downgrades
            WHERE org_id = $1 AND detector = $2 FOR UPDATE`, [orgId, detectorCode]);
                const existing = rows[0]?.record;
                if (!existing || existing.revertedAt)
                    return null;
                const next = {
                    ...existing,
                    revertedAt: new Date().toISOString(),
                    revertedBy,
                };
                await client.query(`UPDATE detector_downgrades SET record = $3, updated_at = now()
            WHERE org_id = $1 AND detector = $2`, [orgId, detectorCode, JSON.stringify(next)]);
                return next;
            });
        },
        // --- Billing surface ---
        async createOrgWithSubscription(input) {
            return tx(async (client) => {
                const orgRes = await client.query(`INSERT INTO orgs (name, github_org) VALUES ($1, $2)
             RETURNING id, name, created_at`, [input.orgName, input.githubOrg ?? null]);
                const orgRow = orgRes.rows[0];
                const orgId = orgRow.id;
                await client.query(`INSERT INTO org_settings (org_id, plan, seats, seats_used)
             VALUES ($1, $2, $3, 1)`, [orgId, input.plan, PLANS[input.plan].seatsIncluded]);
                await client.query(`INSERT INTO subscriptions
             (org_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
             VALUES ($1, $2, $3, $4, $5, $6)`, [
                    orgId,
                    input.stripeCustomerId,
                    input.stripeSubscriptionId,
                    input.plan,
                    input.status,
                    input.currentPeriodEnd ?? null,
                ]);
                const secret = generateApiKey();
                const keyRes = await client.query(`INSERT INTO api_keys (org_id, key_hash, key_preview, label, suspended)
             VALUES ($1, $2, $3, $4, false)
             RETURNING id`, [
                    orgId,
                    hashApiKey(secret),
                    maskApiKey(secret),
                    input.keyLabel ?? "Primary key",
                ]);
                const org = {
                    id: orgId,
                    name: orgRow.name,
                    createdAt: iso(orgRow.created_at),
                };
                const keyRecord = {
                    keyId: keyRes.rows[0].id,
                    key: secret,
                    orgId,
                    orgName: input.orgName,
                    label: input.keyLabel ?? "Primary key",
                    suspended: false,
                };
                return { org, keySecret: secret, keyRecord };
            });
        },
        async updateSubscriptionByStripeId(stripeSubscriptionId, patch) {
            return tx(async (client) => {
                const found = await client.query(`SELECT org_id FROM subscriptions WHERE stripe_subscription_id = $1 FOR UPDATE`, [stripeSubscriptionId]);
                const orgId = found.rows[0]?.org_id;
                if (!orgId)
                    return null;
                const sets = [];
                const params = [];
                if (patch.plan !== undefined) {
                    params.push(patch.plan);
                    sets.push(`plan = $${params.length}`);
                }
                if (patch.status !== undefined) {
                    params.push(patch.status);
                    sets.push(`status = $${params.length}`);
                }
                if (patch.currentPeriodEnd !== undefined) {
                    params.push(patch.currentPeriodEnd);
                    sets.push(`current_period_end = $${params.length}`);
                }
                sets.push("updated_at = now()");
                params.push(stripeSubscriptionId);
                await client.query(`UPDATE subscriptions SET ${sets.join(", ")}
            WHERE stripe_subscription_id = $${params.length}`, params);
                if (patch.plan !== undefined) {
                    await client.query(`UPDATE org_settings SET plan = $2 WHERE org_id = $1`, [
                        orgId,
                        patch.plan,
                    ]);
                }
                if (patch.status !== undefined) {
                    await applyStatusToKeys(client, orgId, patch.status);
                }
                return orgId;
            });
        },
        async upsertSubscriptionFromStripe(sub) {
            return tx(async (client) => {
                const existing = await client.query(`SELECT org_id FROM subscriptions WHERE stripe_subscription_id = $1 FOR UPDATE`, [sub.stripeSubscriptionId]);
                if (existing.rows[0]) {
                    const orgId = existing.rows[0].org_id;
                    await client.query(`UPDATE subscriptions
                SET plan = $2, status = $3, current_period_end = $4, updated_at = now()
              WHERE stripe_subscription_id = $1`, [
                        sub.stripeSubscriptionId,
                        sub.plan,
                        sub.status,
                        sub.currentPeriodEnd ?? null,
                    ]);
                    await client.query(`UPDATE org_settings SET plan = $2 WHERE org_id = $1`, [
                        orgId,
                        sub.plan,
                    ]);
                    await applyStatusToKeys(client, orgId, sub.status);
                    return orgId;
                }
                const byCustomer = await client.query(`SELECT org_id FROM subscriptions WHERE stripe_customer_id = $1 LIMIT 1`, [sub.stripeCustomerId]);
                let orgId = byCustomer.rows[0]?.org_id;
                if (!orgId) {
                    const orgRes = await client.query(`INSERT INTO orgs (name) VALUES ($1) RETURNING id`, [sub.stripeCustomerId]);
                    orgId = orgRes.rows[0].id;
                    await client.query(`INSERT INTO org_settings (org_id, plan, seats, seats_used)
               VALUES ($1, $2, $3, 1)`, [orgId, sub.plan, PLANS[sub.plan].seatsIncluded]);
                }
                else {
                    await client.query(`UPDATE org_settings SET plan = $2 WHERE org_id = $1`, [
                        orgId,
                        sub.plan,
                    ]);
                }
                await client.query(`INSERT INTO subscriptions
             (org_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
             VALUES ($1, $2, $3, $4, $5, $6)`, [
                    orgId,
                    sub.stripeCustomerId,
                    sub.stripeSubscriptionId,
                    sub.plan,
                    sub.status,
                    sub.currentPeriodEnd ?? null,
                ]);
                await applyStatusToKeys(client, orgId, sub.status);
                return orgId;
            });
        },
        async setKeysSuspended(orgId, suspended) {
            await pool.query(`UPDATE api_keys SET suspended = $2 WHERE org_id = $1`, [
                orgId,
                suspended,
            ]);
        },
        async recordStripeEvent(eventId, eventType, payload) {
            const res = await pool.query(`INSERT INTO stripe_webhook_events (event_id, event_type, payload)
             VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING`, [eventId, eventType, JSON.stringify(payload ?? {})]);
            return (res.rowCount ?? 0) > 0;
        },
        async removeStripeEvent(eventId) {
            await pool.query(`DELETE FROM stripe_webhook_events WHERE event_id = $1`, [
                eventId,
            ]);
        },
        async createKeyClaim(sessionId, orgId, ciphertext, expiresAt) {
            await pool.query(`INSERT INTO key_claims (checkout_session_id, org_id, key_ciphertext, expires_at)
             VALUES ($1, $2, $3, $4)
           ON CONFLICT (checkout_session_id) DO NOTHING`, [sessionId, orgId, ciphertext, expiresAt]);
        },
        async claimKey(sessionId) {
            return tx(async (client) => {
                const { rows } = await client.query(`SELECT key_ciphertext, claimed_at, expires_at
             FROM key_claims WHERE checkout_session_id = $1 FOR UPDATE`, [sessionId]);
                const row = rows[0];
                if (!row)
                    return null;
                if (row.claimed_at)
                    return { alreadyClaimed: true };
                if (new Date(row.expires_at).getTime() <= Date.now())
                    return { expired: true };
                await client.query(`UPDATE key_claims SET claimed_at = now() WHERE checkout_session_id = $1`, [sessionId]);
                return { ciphertext: row.key_ciphertext };
            });
        },
        async purgeExpiredClaims() {
            const res = await pool.query(`DELETE FROM key_claims WHERE claimed_at IS NULL AND expires_at <= now()`);
            return res.rowCount ?? 0;
        },
        async getSubscriptionForOrg(orgId) {
            const { rows } = await pool.query(`SELECT * FROM subscriptions WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1`, [orgId]);
            return rows[0] ? mapSubscription(rows[0]) : null;
        },
        async listSubscriptions() {
            const { rows } = await pool.query(`SELECT * FROM subscriptions ORDER BY created_at DESC`);
            return rows.map(mapSubscription);
        },
    };
}
