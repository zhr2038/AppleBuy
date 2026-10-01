// C-004 quota takeover: read-only public-entry preflight. This module is not a CheckoutPort.
// It is deliberately outside src so the offline application keeps its existing network prohibition.
import { createHash } from "node:crypto";

export const CATALOG_URL = "https://www.apple.com.cn/shop/buy-iphone/iphone-duo";
export const OBSERVED_EXAMPLE_URL = "https://www.apple.com.cn/shop/buy-iphone/iphone-duo/mk2q4ch/a";
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 8000;
export const SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;
const URLS = new Set([CATALOG_URL, OBSERVED_EXAMPLE_URL]);

export type EntryStatus = "PUBLIC_CATALOG_ONLY" | "RENDERED_PRELAUNCH" | "RENDERED_ENTRY_ONLY" |
  "RENDERING_INCOMPLETE" | "STALE_OBSERVATION" | "UNKNOWN_STRUCTURE" | "RETRIEVAL_FAILED" |
  "RATE_LIMITED" | "AUTH_REQUIRED" | "ACCESS_RESTRICTED" | "REDIRECT_BLOCKED";

export type EntryReport = {
  schema: "applebuy-public-entry/v1";
  status: EntryStatus;
  recognized: boolean;
  checkedAt: string;
  observedAt: string | null;
  provenance: "direct-public-html" | "imported-public-html" | "imported-public-dom";
  provenanceClaim: "actual-browser" | "fixture" | null;
  url: string | null;
  httpStatus: number | null;
  bodySha256: string | null;
  receivedBytes: number | null;
  title: string | null;
  publishedPreorderNotice: string | null;
  publishedApprovalCondition: true | null;
  continueEnabled: boolean | null;
  pickupUnavailable: boolean | null;
  notOnSale: boolean | null;
  catalogUrlIdentifier: "mk2q4ch/a" | null;
  checkoutSkuVerified: false;
  configuration: "NOT_LOADED";
  slotContractVerified: false;
  realMutationsAvailable: false;
  purchaseReady: false;
  blockers: string[];
};

function report(status: EntryStatus, now: number, url: string | null,
  provenance: EntryReport["provenance"] = "direct-public-html"): EntryReport {
  return {
    schema: "applebuy-public-entry/v1", status, recognized: false,
    checkedAt: new Date(now).toISOString(), observedAt: null, provenance, provenanceClaim: null,
    url, httpStatus: null, bodySha256: null, receivedBytes: null, title: null,
    publishedPreorderNotice: null, publishedApprovalCondition: null,
    continueEnabled: null, pickupUnavailable: null, notOnSale: null,
    catalogUrlIdentifier: url === OBSERVED_EXAMPLE_URL ? "mk2q4ch/a" : null,
    checkoutSkuVerified: false, configuration: "NOT_LOADED", slotContractVerified: false,
    realMutationsAvailable: false, purchaseReady: false,
    blockers: ["real-user-plan-not-loaded", "checkout-sku-and-store-binding-unverified",
      "duo-slot-and-order-contracts-unverified", "real-operation-not-enabled"],
  };
}

function normalizeText(text: string): string {
  return text.replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ").replace(/\s+/gu, " ").trim();
}

function publicTitle(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 120) return null;
  const text = normalizeText(value);
  return /^购买 iPhone Duo(?: (?:256GB|512GB|1TB|2TB) (?:夜空色|星光白色))? - Apple \(中国大陆\)$/.test(text) ? text : null;
}

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/** Markup that is explicitly not displayed: inert template/noscript, the `hidden` attribute, aria-hidden, inline hiding. */
function explicitlyHidden(name: string, attrs: string): boolean {
  if (name === "template" || name === "noscript") return true;
  for (const m of attrs.matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const key = m[1].toLowerCase();
    const value = (m[2] ?? m[3] ?? m[4] ?? "").trim().toLowerCase();
    if (key === "hidden") return true;
    if (key === "aria-hidden" && value === "true") return true;
    if (key === "style" && /(?:^|;)\s*(?:display\s*:\s*none|(?:content-)?visibility\s*:\s*hidden)\b/.test(value)) return true;
  }
  return false;
}

/**
 * Removes explicitly hidden subtrees so they cannot supply positive heading/sale/approval signals. This is a
 * conservative markup filter, not computed visibility: stylesheet/class hiding, hydration and layout are unknown.
 * An unclosed hidden element drops the rest of the document (fewer positive signals, never more).
 */
function withoutHiddenMarkup(html: string): string {
  let out = "";
  let last = 0;
  let foreign = 0; // inside <svg>/<math>, "/>" really closes an element; in HTML it is ignored for non-void tags
  let skip: { name: string; depth: number } | null = null;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    const attrs = m[3];
    const empty = !closing && (VOID_ELEMENTS.has(name) || (/\/\s*$/.test(attrs) && (foreign > 0 || name === "svg" || name === "math")));
    if ((name === "svg" || name === "math") && !empty) foreign = closing ? Math.max(0, foreign - 1) : foreign + 1;
    if (skip) {
      if (name === skip.name && !empty) {
        if (!closing) skip.depth++;
        else if (--skip.depth === 0) {
          skip = null;
          last = m.index + m[0].length;
        }
      }
      continue;
    }
    if (!closing && !empty && explicitlyHidden(name, attrs)) {
      out += html.slice(last, m.index);
      skip = { name, depth: 1 };
    }
  }
  return skip ? out : out + html.slice(last);
}

/** HTML alone cannot attest the hydrated control state. It never infers no stock from missing fields. */
export function inspectPublicHtml(html: string, url: string, now = Date.now()): EntryReport {
  const out = report("UNKNOWN_STRUCTURE", now, URLS.has(url) ? url : null, "imported-public-html");
  if (!URLS.has(url) || typeof html !== "string" || Buffer.byteLength(html) > MAX_BODY_BYTES) return out;
  out.bodySha256 = createHash("sha256").update(html).digest("hex");
  out.receivedBytes = Buffer.byteLength(html);
  // Only inspect server-rendered displayed markup; script/comment/style and explicitly hidden subtrees
  // (template, noscript, hidden, aria-hidden, inline display:none) cannot supply positive page signals.
  const visible = withoutHiddenMarkup(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ""));
  // The current page contains SVG icon <title> elements in the body. Only document head title is authoritative.
  const heads = [...visible.matchAll(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/gi)];
  if (heads.length !== 1) { out.blockers.push("document-head-unrecognized"); return out; }
  const titles = [...heads[0][1].matchAll(/<title\b[^>]*>([^<]*)<\/title\s*>/gi)];
  const h1s = [...visible.matchAll(/<h1\b[^>]*>([^<]*)<\/h1\s*>/gi)];
  if (titles.length !== 1 || h1s.length !== 1 || normalizeText(h1s[0][1]) !== "iPhone Duo") return out;
  const title = publicTitle(titles[0][1]);
  if (!title) return out;
  // A variant title/URL mismatch cannot establish even the requested public entry.
  if (url === OBSERVED_EXAMPLE_URL && title !== "购买 iPhone Duo 512GB 夜空色 - Apple (中国大陆)") return out;
  const text = normalizeText(visible.replace(/<[^>]*>/g, " "));
  out.status = "PUBLIC_CATALOG_ONLY";
  out.recognized = true;
  out.title = title;
  out.publishedPreorderNotice = text.match(/\d{1,2} 月 \d{1,2} 日晚 \d{1,2} 点接受预购。\d{1,2} 月 \d{1,2} 日发售。/)?.[0] ?? null;
  out.publishedApprovalCondition = text.includes("机型将在获得批准后发售") ? true : null;
  out.blockers.push("hydrated-page-and-controls-not-observed");
  return out;
}

/** Import a deliberately narrow public semantic snapshot; provenance is a claim, not independent proof. */
export function inspectPublicDom(input: unknown, now = Date.now()): EntryReport {
  const bad = report("UNKNOWN_STRUCTURE", now, null, "imported-public-dom");
  if (!input || typeof input !== "object" || Array.isArray(input)) return bad;
  const x = input as Record<string, unknown>;
  const expected = ["schema", "provenance", "url", "observedAt", "renderComplete", "title", "productHeading",
    "continuePresent", "continueEnabled", "pickupUnavailable", "notOnSale"];
  if (Object.keys(x).length !== expected.length || expected.some(k => !Object.hasOwn(x, k))) return bad;
  if (x.schema !== "applebuy-public-dom/v1" || (x.provenance !== "actual-browser" && x.provenance !== "fixture") ||
    typeof x.url !== "string" || !URLS.has(x.url) || typeof x.observedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x.observedAt) ||
    typeof x.renderComplete !== "boolean" ||
    typeof x.productHeading !== "string" || normalizeText(x.productHeading) !== "iPhone Duo" ||
    typeof x.continuePresent !== "boolean" || ![null, true, false].includes(x.continueEnabled as null | boolean) ||
    ![null, true, false].includes(x.pickupUnavailable as null | boolean) ||
    ![null, true, false].includes(x.notOnSale as null | boolean)) return bad;
  const title = publicTitle(x.title);
  if (!title || (x.url === OBSERVED_EXAMPLE_URL && title !== "购买 iPhone Duo 512GB 夜空色 - Apple (中国大陆)")) return bad;
  if ((!x.continuePresent && x.continueEnabled !== null) || (x.continuePresent && x.continueEnabled === null)) return bad;
  const observed = Date.parse(x.observedAt);
  if (!Number.isFinite(observed) || observed > now + 5000 ||
    new Date(observed).toISOString().replace(".000Z", "Z") !== x.observedAt.replace(".000Z", "Z")) return bad;
  const out = report("RENDERED_ENTRY_ONLY", now, x.url, "imported-public-dom");
  out.provenanceClaim = x.provenance;
  out.observedAt = x.observedAt;
  out.title = title;
  if (!x.renderComplete) {
    out.status = "RENDERING_INCOMPLETE";
    out.blockers.push("page-render-incomplete");
    return out;
  }
  if (now - observed > SNAPSHOT_MAX_AGE_MS) {
    out.status = "STALE_OBSERVATION";
    out.blockers.push("public-observation-stale");
    return out;
  }
  out.recognized = true;
  out.continueEnabled = x.continueEnabled as boolean | null;
  out.pickupUnavailable = x.pickupUnavailable as boolean | null;
  out.notOnSale = x.notOnSale as boolean | null;
  if (out.notOnSale === true && out.pickupUnavailable === true && out.continueEnabled === false) {
    out.status = "RENDERED_PRELAUNCH";
  }
  if (out.continueEnabled === false) out.blockers.push("continue-control-disabled");
  if (out.pickupUnavailable === true) out.blockers.push("public-entry-pickup-unavailable");
  if (out.notOnSale === true) out.blockers.push("public-entry-not-on-sale");
  if (!x.continuePresent) out.blockers.push("continue-control-not-observed");
  if (x.provenance === "fixture") out.blockers.push("fixture-is-not-real-evidence");
  out.blockers.push("imported-provenance-requires-independent-verification");
  return out;
}

/** Exactly one ordinary GET to one of two observed public URLs; no redirects, retries, cookies or mutations. */
export async function readPublicEntry(entry: "catalog" | "observed-example" = "catalog"): Promise<EntryReport> {
  const now = Date.now();
  const url = entry === "catalog" ? CATALOG_URL : entry === "observed-example" ? OBSERVED_EXAMPLE_URL : null;
  if (!url) return report("UNKNOWN_STRUCTURE", now, null);
  let response: Response | undefined;
  try {
    response = await globalThis.fetch(url, {
      method: "GET", redirect: "manual", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { Accept: "text/html" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const status: EntryStatus | null = response.status === 429 ? "RATE_LIMITED" : response.status === 401 ? "AUTH_REQUIRED" :
      response.status === 403 ? "ACCESS_RESTRICTED" : response.status >= 300 && response.status < 400 ? "REDIRECT_BLOCKED" :
      response.status !== 200 ? "RETRIEVAL_FAILED" : null;
    if (status) {
      const out = report(status, now, url);
      out.httpStatus = response.status;
      return out;
    }
    if (!/^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "") ||
      (response.url && response.url !== url) || !response.body) {
      const out = report("UNKNOWN_STRUCTURE", now, url);
      out.httpStatus = response.status;
      return out;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY_BYTES) return report("UNKNOWN_STRUCTURE", now, url);
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const html = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const out = inspectPublicHtml(html, url, Date.now());
    out.provenance = "direct-public-html";
    if (out.recognized) out.observedAt = out.checkedAt;
    out.httpStatus = response.status;
    return out;
  } catch {
    // Do not echo exception messages or response bodies: these may contain URLs, network details or challenge data.
    return report("RETRIEVAL_FAILED", Date.now(), url);
  } finally {
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}
