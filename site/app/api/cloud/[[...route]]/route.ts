import { Hono } from "hono";
import { handle } from "hono/vercel";
import { createCloudApp } from "trailhead-cloud";
import { getBillingStore } from "@/lib/cloudStore";

/**
 * Mounts the Trailhead Cloud Hono app (cloud/src/app.ts) at /api/cloud/* via
 * the hono/vercel adapter. The cloud app declares its routes at the root
 * (/health, /v1/*, /dashboard) — we re-base them under /api/cloud with a
 * parent Hono `route()` mount so, e.g., POST /api/cloud/v1/evaluations reaches
 * the cloud app's /v1/evaluations handler.
 *
 * The store is the same Postgres-backed BillingStore the billing routes use
 * (createPgStore when DATABASE_URL is set), so /v1 ingest and billing share
 * one source of truth.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let handlerPromise: Promise<(req: Request) => Response | Promise<Response>> | null = null;

function getHandler(): Promise<(req: Request) => Response | Promise<Response>> {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const store = await getBillingStore();
      const cloudApp = createCloudApp({ store });
      const root = new Hono().route("/api/cloud", cloudApp as unknown as Hono);
      return handle(root) as (req: Request) => Response | Promise<Response>;
    })();
  }
  return handlerPromise;
}

async function dispatch(req: Request): Promise<Response> {
  const h = await getHandler();
  return h(req);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
export const OPTIONS = dispatch;
