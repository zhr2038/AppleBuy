// Local browser service (C-003). Binds ONLY to 127.0.0.1; never listens on a LAN interface and never makes outbound
// requests. Every request must carry a loopback Host header (DNS-rebinding defence). Every mutation must be a JSON
// POST with an exact loopback Origin, the per-process session token and a client id; all assets are local files.
// Browser tabs are clients, never executors: the single TaskApp in this process is the only engine.
// Control lease: one tab controls start/resume/plan/formal actions. The lease ends only when that tab's event stream
// actually closes (tab closed or reloaded) — not after a quiet period. Pause/takeover/stop only reduce automation,
// so any authenticated local tab may send them.
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ControlAction } from "../engine.ts";
import type { SiteScenario } from "../mock/live-site.ts";
import type { TaskApp, Result } from "./task-app.ts";

const WEB_DIR = resolve(import.meta.dirname, "..", "..", "web");
const ASSETS: Record<string, [string, string]> = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/render.js": ["render.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
};
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const CLIENT_RE = /^c-[a-z0-9]{8,32}$/;
const SAFETY_ACTIONS = new Set<ControlAction>(["pause", "takeover", "stop"]);
export const BIND_HOST = "127.0.0.1";

export type ServerHandle = { port: number; url: string; token: string; close: () => Promise<void>; controller: () => string | null };

function sameToken(a: string | null | undefined, b: string): boolean {
  if (typeof a !== "string" || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function startServer(app: TaskApp, o: { port?: number } = {}): Promise<ServerHandle> {
  const token = randomBytes(24).toString("hex");
  const streams = new Map<string, http.ServerResponse>();
  let controller: string | null = null;
  let port = 0;
  const hosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = () => new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

  const send = (res: http.ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify(body));
  };
  const viewFor = (clientId: string | null) => {
    let state: unknown;
    try {
      state = app.state();
    } catch (e) {
      state = { fatal: e instanceof Error ? e.message : String(e) };
    }
    return { ...(state as object), control: { you: clientId !== null && clientId === controller, held: controller !== null, clients: streams.size } };
  };
  let pending = false;
  const broadcast = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      for (const [id, res] of streams) res.write(`data: ${JSON.stringify(viewFor(id))}\n\n`);
    }, 30);
  };
  const unsubscribe = app.subscribe(broadcast);

  const readBody = (req: http.IncomingMessage): Promise<unknown> =>
    new Promise((done) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size <= 65536) chunks.push(c);
      });
      req.on("end", () => {
        if (size > 65536) return done(Symbol.for("too-large"));
        try {
          done(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
        } catch {
          done(Symbol.for("bad-json"));
        }
      });
      req.on("error", () => done(Symbol.for("bad-json")));
    });

  const handle = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!hosts().has(String(req.headers.host ?? ""))) return send(res, 421, { ok: false, code: "host", message: "只接受本机地址访问" });
    const asset = ASSETS[url.pathname];
    if (req.method === "GET" && asset) {
      let body = readFileSync(join(WEB_DIR, asset[0]), "utf8");
      if (asset[0] === "index.html") body = body.replace("__SESSION_TOKEN__", token);
      res.writeHead(200, { "content-type": asset[1], "content-security-policy": CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store", "x-frame-options": "DENY" });
      return res.end(body);
    }
    if (!url.pathname.startsWith("/api/")) return send(res, 404, { ok: false, code: "not-found" });
    const clientId = String(req.headers["x-client-id"] ?? url.searchParams.get("client") ?? "");
    if (req.method === "GET") {
      if (!sameToken(String(req.headers["x-session-token"] ?? url.searchParams.get("token") ?? ""), token)) return send(res, 403, { ok: false, code: "token" });
      if (url.pathname === "/api/state") return send(res, 200, viewFor(CLIENT_RE.test(clientId) ? clientId : null));
      if (url.pathname === "/api/events" && CLIENT_RE.test(clientId)) {
        res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-content-type-options": "nosniff" });
        streams.get(clientId)?.end();
        streams.set(clientId, res);
        res.write(`data: ${JSON.stringify(viewFor(clientId))}\n\n`);
        req.on("close", () => {
          if (streams.get(clientId) === res) streams.delete(clientId);
          // The controlling tab's connection actually closed: the lease ends (the task itself keeps running).
          if (controller === clientId && !streams.has(clientId)) controller = null;
          broadcast();
        });
        return;
      }
      return send(res, 404, { ok: false, code: "not-found" });
    }
    if (req.method !== "POST") return send(res, 405, { ok: false, code: "method" });
    // Mutation checks: exact loopback Origin, session token, JSON body, well-formed client id.
    if (!origins().has(String(req.headers.origin ?? ""))) return send(res, 403, { ok: false, code: "origin", message: "拒绝：请求来源不是本机界面" });
    if (!sameToken(String(req.headers["x-session-token"] ?? ""), token)) return send(res, 403, { ok: false, code: "token", message: "拒绝：会话令牌无效" });
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 415, { ok: false, code: "content-type" });
    if (!CLIENT_RE.test(clientId)) return send(res, 400, { ok: false, code: "client" });
    const body = await readBody(req);
    if (typeof body === "symbol") return send(res, 400, { ok: false, code: "body" });
    const b = body as Record<string, unknown>;
    const isController = controller === clientId;

    if (url.pathname === "/api/claim") {
      if (!streams.has(clientId)) return send(res, 409, { ok: false, code: "no-stream", message: "该标签页尚未连接状态推送，不能获取控制权" });
      if (controller && controller !== clientId && streams.has(controller)) return send(res, 409, { ok: false, code: "controlled-elsewhere", message: "另一个标签页正在控制此任务；关闭那个标签页后才能获取控制权（不会按时间抢占）" });
      controller = clientId;
      broadcast();
      return send(res, 200, { ok: true, message: "本标签页已获得控制权" });
    }
    let r: Result;
    if (url.pathname === "/api/control") {
      const action = b.action as ControlAction;
      if (!["pause", "resume", "takeover", "stop"].includes(String(action))) return send(res, 400, { ok: false, code: "action" });
      if (!SAFETY_ACTIONS.has(action) && !isController) return send(res, 409, { ok: false, code: "not-controller", message: "只有控制中的标签页可以恢复运行" });
      r = app.control(action);
    } else {
      if (!isController) return send(res, 409, { ok: false, code: "not-controller", message: "本标签页没有控制权（只读）。请先获取控制权" });
      if (url.pathname === "/api/start") r = app.start((typeof b.scenario === "string" ? b.scenario : "refuse-then-accept") as SiteScenario);
      else if (url.pathname === "/api/recover") r = app.recover();
      else if (url.pathname === "/api/plan") r = app.editPlan(b.plan);
      else if (url.pathname === "/api/formal") r = app.armFormal(String(b.planHash ?? ""), String(b.phrase ?? ""));
      else return send(res, 404, { ok: false, code: "not-found" });
    }
    broadcast();
    return send(res, r.ok ? 200 : 409, r);
  };

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      if (!res.headersSent) send(res, 500, { ok: false, code: "internal", message: e instanceof Error ? e.message : String(e) });
    });
  });
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen({ host: BIND_HOST, port: o.port ?? 0 }, () => ok());
  });
  const addr = server.address();
  port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    token,
    controller: () => controller,
    close: async () => {
      unsubscribe();
      for (const s of streams.values()) s.end();
      const closed = new Promise<void>((r) => server.close(() => r()));
      server.closeAllConnections();
      await closed;
    },
  };
}
