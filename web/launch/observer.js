// C-007 semantic page observer. Plain ES module shared by the local browser replay (real DOM via fromDom) and
// Node tests/CLI (synthetic sample markup via parseHtml). It reads only visible text, roles, native/ARIA states and
// control options; it never reads input values, cookies, storage or URLs and never acts on the page.
// Text anchors marked OBSERVED come from the sanitized Oct 1 Pro / Oct 2 Duo reports. Anchors marked UNVERIFIED or
// SYNTHETIC have no current official evidence; they can only make the observer stop or wait, never permit an action.
// Layout, class names and element order are deliberately ignored: meaning comes from text, roles and states.

export const OBSERVATION_SCHEMA = "applebuy-page-observation/v1";

export const ANCHORS = {
  prelaunch: { provenance: "OBSERVED duo 2026-10-02", texts: ["暂未发售", "目前暂不提供 Apple Store 零售店取货服务"] },
  signIn: { provenance: "OBSERVED pro 2026-10-01", texts: ["以游客身份继续"] },
  consent: { provenance: "OBSERVED pro 2026-10-01", texts: ["Apple 和你的数据隐私"] },
  pickup: { provenance: "OBSERVED pro 2026-10-01", texts: ["我要取货"] },
  timePlaceholder: { provenance: "OBSERVED pro 2026-10-01", texts: ["可选时段"] },
  continueLabel: { provenance: "OBSERVED pro/duo", prefix: "继续" },
  maintenance: { provenance: "UNVERIFIED hypothesis, no current official maintenance page observed", texts: ["正在更新 Apple Store", "我们正在更新", "稍后再来"] },
  quantity: { provenance: "SYNTHETIC: quantity line on the pickup page is not in the sanitized Pro report", re: /^数量\s*[:：]?\s*(\d+)$/ },
};

const SKIP = new Set(["script", "style", "template", "noscript", "head"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const TIME_RANGE = /^(\d{2}):(\d{2})\s*[-–—~至]\s*(\d{2}):(\d{2})$/;
const CN_DATE = /^(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(?:星期|周)[一二三四五六日天])?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PRICE = /(?:RMB|¥|￥)\s*([\d,]+)(?:\.(\d{2}))?/g;

/** Minimal tolerant parser for the project's own synthetic samples (Node side only; not a general HTML parser). */
export function parseHtml(html) {
  const root = { tag: "#root", attrs: {}, kids: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/gi;
  let n = 0;
  for (const m of html.matchAll(re)) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) { top.kids.push({ text: decode(m[4]) }); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const at = stack.map((x) => x.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? "");
    const el = { tag, attrs, kids: [], path: `n${n++}`, inheritedDisabled: top.inheritedDisabled || 'disabled' in top.attrs || top.attrs['aria-disabled'] === 'true' };
    top.kids.push(el);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(el);
  }
  return root;
}
function decode(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

/** Browser side: copy only structure, semantic attributes and visible text. Live elements are kept in `live`. */
export function fromDom(el, live = new Map(), path = "0") {
  if (el.nodeType === 3) return { text: el.nodeValue ?? "" };
  if (el.nodeType !== 1) return null;
  const tag = el.tagName.toLowerCase();
  const attrs = {};
  for (const name of ["hidden", "aria-hidden", "aria-busy", "aria-disabled", "aria-selected", "aria-checked", "aria-pressed", "aria-label", "role", "disabled", "type", "style"]) {
    if (el.hasAttribute(name)) attrs[name] = el.getAttribute(name) ?? "";
  }
  // Native option state comes from the live element (the attribute may not reflect the current choice).
  if (tag === "option") { delete attrs.selected; if (el.selected) attrs.selected = ""; if (el.disabled) attrs.disabled = ""; }
  if (tag === "input" && /^(radio|checkbox)$/.test(el.type)) {
    if (el.checked) attrs.checked = "";
    if (!attrs['aria-label'] && el.labels?.length) attrs['aria-label'] = [...el.labels].map(x => x.textContent ?? '').join(' ');
  }
  // Native options do not have visible rectangles while their select is closed. Their parent's visibility
  // determines whether they are offered; hiding each option would lose the actual list.
  if (!['option', 'optgroup'].includes(tag) && typeof el.checkVisibility === "function" && el.isConnected && !el.checkVisibility()) attrs.hidden = "";
  const inheritedDisabled = !!el.parentElement?.closest('[disabled], [aria-disabled="true"]');
  const node = { tag, attrs, kids: [], path, inheritedDisabled };
  live.set(path, el);
  let i = 0;
  for (const child of el.childNodes) {
    const c = fromDom(child, live, `${path}.${i++}`);
    if (c) node.kids.push(c);
  }
  return node;
}

const norm = (s) => s.replace(/\s+/gu, " ").trim();
function hidden(n) {
  const a = n.attrs;
  return SKIP.has(n.tag) || "hidden" in a || a["aria-hidden"] === "true" || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(a.style ?? "");
}
function* walk(n) {
  if (n.text !== undefined) return;
  if (n.tag !== "#root" && hidden(n)) return;
  yield n;
  for (const k of n.kids) yield* walk(k);
}
function textOf(n) {
  if (n.text !== undefined) return n.text;
  if (n.tag !== "#root" && hidden(n)) return "";
  return n.kids.map(textOf).join(" ");
}
const label = (n) => norm(n.attrs["aria-label"] ?? textOf(n));
const ownText = (n) => norm(textOf(n));
const disabled = (n) => !!n.inheritedDisabled || "disabled" in n.attrs || n.attrs["aria-disabled"] === "true";
const selected = (n) => "selected" in n.attrs || "checked" in n.attrs || n.attrs["aria-selected"] === "true" || n.attrs["aria-checked"] === "true" || n.attrs["aria-pressed"] === "true";
const isButton = (n) => n.tag === "button" || n.attrs.role === "button" || (n.tag === "input" && /^(submit|button)$/i.test(n.attrs.type ?? ""));
const isChoice = (n) => n.tag === "option" || ["option", "radio", "tab"].includes(n.attrs.role ?? "") || (n.tag === 'input' && n.attrs.type === 'radio') || (n.tag === "button" && "aria-pressed" in n.attrs);
const elementKids = (n) => n.kids.filter((k) => k.text === undefined && !hidden(k));

/** A displayed date. The year is never guessed: a label without a year yields date null (cannot be bound). */
export function parseDateLabel(text) {
  const iso = ISO_DATE.exec(text);
  const valid = d => { const n = new Date(`${d}T00:00:00Z`); return Number.isFinite(+n) && n.toISOString().slice(0, 10) === d; };
  if (iso) return valid(text) ? { date: text, yearShown: true } : null;
  const english = /^(January|February|March|April|May|June|July|August|September|October|November|December) ([1-9]|[12]\d|3[01])$/.exec(text);
  if (english) return { date: null, yearShown: false };
  const m = CN_DATE.exec(text);
  if (!m) return null;
  if (+m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
  if (!m[1]) return { date: null, yearShown: false };
  const date = `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
  return valid(date) ? { date, yearShown: true } : null;
}

/** Innermost visible elements whose own text satisfies `pred` (no descendant element satisfies it too). */
function innermost(els, pred) {
  return els.filter((n) => n.tag !== "#root" && pred(ownText(n)) && !elementKids(n).some((k) => [...walk(k)].some((d) => pred(ownText(d)))));
}

/**
 * Purchase conditions that this page actually displays. A product name found anywhere is NOT enough: model, capacity
 * and color must appear together in one element; store must be one exact element; one price; quantity must be shown.
 */
function conditions(els, expect) {
  const c = { product: { status: "missing" }, store: { status: "missing" }, price: { status: "missing" }, quantity: { status: "missing" }, fulfillment: { status: "missing" } };
  const line = (p) => (t) => t.includes(p.model) && t.includes(p.capacity) && t.includes(p.color) && t.length <= 120;
  const hits = (expect.products ?? []).filter((p) => innermost(els, line(p)).length > 0);
  if (hits.length === 1) c.product = { status: "verified", id: hits[0].id, text: `${hits[0].model} ${hits[0].capacity} ${hits[0].color}` };
  else if (hits.length > 1) c.product = { status: "ambiguous" };
  const stores = new Set(innermost(els, (t) => (expect.stores ?? []).includes(t)).map(ownText));
  if (stores.size === 1) c.store = { status: "verified", value: [...stores][0] };
  else if (stores.size > 1) c.store = { status: "ambiguous" };
  const prices = new Set();
  for (const n of innermost(els, (t) => /(?:RMB|¥|￥)\s*[\d,]+/.test(t))) for (const m of ownText(n).matchAll(PRICE)) prices.add(Number(m[1].replace(/,/g, "")) + (m[2] ? Number(m[2]) / 100 : 0));
  if (prices.size === 1) c.price = { status: "verified", value: [...prices][0] };
  else if (prices.size > 1) c.price = { status: "ambiguous" };
  const qty = new Set(innermost(els, (t) => ANCHORS.quantity.re.test(t)).map((n) => Number(ANCHORS.quantity.re.exec(ownText(n))[1])));
  if (qty.size === 1) c.quantity = { status: "verified", value: [...qty][0], provenance: ANCHORS.quantity.provenance };
  else if (qty.size > 1) c.quantity = { status: "ambiguous" };
  return c;
}

/**
 * Classifies one page snapshot. Returns facts and the stage; never a decision and never stock/acceptance.
 * expect = { products: [{id, model, capacity, color}], stores: [labels] } from the authorized plan.
 */
export function observePage(tree, { observedAt, expect }) {
  const out = {
    schema: OBSERVATION_SCHEMA, observedAt, stage: "UNKNOWN_STRUCTURE", detail: "no-recognized-stage",
    conditions: null, continue: null, dates: [], selectedDate: null, times: [], timePlaceholderSelected: null,
    // Nothing on a page proves the official list is complete; this is reported, never assumed.
    listCompleteness: "unverified", anchors: [],
  };
  const els = [...walk(tree)];
  const text = norm(textOf(tree));
  const has = (key) => {
    const hit = (ANCHORS[key].texts ?? []).some((t) => text.includes(t));
    if (hit) out.anchors.push(`${key}:${ANCHORS[key].provenance}`);
    return hit;
  };
  if (els.some((n) => n.attrs["aria-busy"] === "true")) return { ...out, stage: "RENDERING_INCOMPLETE", detail: "busy-region" };
  if (has("maintenance")) return { ...out, stage: "MAINTENANCE", detail: "maintenance-anchor-unverified" };
  if (has("consent")) return { ...out, stage: "CONSENT_REQUIRED", detail: "human-only-consent" };
  if (has("signIn") || els.some((n) => n.tag === "input" && n.attrs.type === "password")) return { ...out, stage: "SIGN_IN_REQUIRED", detail: "human-only-identity" };

  const continues = els.filter((n) => isButton(n) && label(n).startsWith(ANCHORS.continueLabel.prefix));
  if (continues.length > 1) return { ...out, stage: "UNKNOWN_STRUCTURE", detail: "ambiguous-continue" };
  if (continues.length === 1) out.continue = { enabled: !disabled(continues[0]), ref: continues[0].path ?? null };
  out.conditions = conditions(els, expect);

  if (has("pickup")) {
    // The mere presence of the pickup tab is not a selected fulfillment method.
    const picked = els.filter(n => isChoice(n) && label(n) === '我要取货' && selected(n) && !disabled(n));
    if (picked.length === 1) out.conditions.fulfillment = { status: "verified", value: "pickup" };
    const groups = els.filter((n) => n.tag === "select" || ["radiogroup", "listbox", "tablist"].includes(n.attrs.role ?? ""))
      .map((g) => ({ g, opts: [...walk(g)].filter((n) => n !== g && isChoice(n)) }));
    const timeGroups = groups.filter(({ opts }) => opts.some((o) => TIME_RANGE.test(label(o))));
    if (timeGroups.length !== 1) return { ...out, stage: timeGroups.length ? "UNKNOWN_STRUCTURE" : "RENDERING_INCOMPLETE", detail: timeGroups.length ? "ambiguous-time-control" : "time-control-not-rendered" };
    const keys = new Set();
    for (const o of timeGroups[0].opts) {
      const l = label(o);
      const m = TIME_RANGE.exec(l);
      if (!m) {
        if (ANCHORS.timePlaceholder.texts.includes(l)) out.timePlaceholderSelected = selected(o);
        else return { ...out, stage: "UNKNOWN_STRUCTURE", detail: "unrecognized-time-option" };
        continue;
      }
      const start = `${m[1]}:${m[2]}`, end = `${m[3]}:${m[4]}`;
      if (![start, end].every(t => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) || start >= end || keys.has(start + end)) return { ...out, stage: "UNKNOWN_STRUCTURE", detail: "invalid-or-duplicate-time" };
      keys.add(start + end);
      out.times.push({ start, end, enabled: !disabled(o), selected: selected(o), ref: o.path ?? null });
    }
    // Exactly one date control group: its choices must all be dates (no guessing which nodes are dates).
    const dateGroups = groups.filter(({ g, opts }) => g !== timeGroups[0].g && opts.length > 0 && opts.every((o) => parseDateLabel(label(o))));
    if (dateGroups.length !== 1) return { ...out, stage: "UNKNOWN_STRUCTURE", detail: dateGroups.length ? "ambiguous-date-control" : "date-control-unrecognized" };
    const seen = new Set();
    for (const d of dateGroups[0].opts) {
      const l = label(d);
      if (seen.has(l)) return { ...out, stage: "UNKNOWN_STRUCTURE", detail: "duplicate-date" };
      seen.add(l);
      const p = parseDateLabel(l);
      out.dates.push({ label: l, date: p.date, yearShown: p.yearShown, enabled: !disabled(d), selected: selected(d), ref: d.path ?? null });
    }
    const sel = out.dates.filter((d) => d.selected);
    if (sel.length !== 1 || !sel[0].enabled) return { ...out, stage: "UNKNOWN_STRUCTURE", detail: "date-selection-unrecognized" };
    out.selectedDate = sel[0].date;
    if (out.times.filter((t) => t.selected).length > 1) return { ...out, stage: "UNKNOWN_STRUCTURE", detail: "multiple-times-selected" };
    const c = out.conditions;
    if (c.product.status !== "verified") return { ...out, stage: "PLAN_MISMATCH", detail: `product-${c.product.status}` };
    if (c.store.status !== "verified") return { ...out, stage: "PLAN_MISMATCH", detail: `store-${c.store.status}` };
    return { ...out, stage: "SLOT_SELECTION", detail: "pickup-date-time-recognized" };
  }

  const h1 = els.filter((n) => n.tag === "h1").map(label);
  if (h1.length === 1) {
    const models = new Set((expect.products ?? []).map((p) => p.model));
    if (!models.has(h1[0])) return { ...out, stage: /^iPhone\b/.test(h1[0]) ? "PLAN_MISMATCH" : "UNKNOWN_STRUCTURE", detail: "product-heading-mismatch" };
    if (has("prelaunch")) return { ...out, stage: "PRELAUNCH", detail: out.continue?.enabled ? "prelaunch-text-with-enabled-continue" : "prelaunch" };
    if (!out.continue) return { ...out, stage: "UNKNOWN_STRUCTURE", detail: "continue-not-found" };
    return { ...out, stage: out.continue.enabled ? "ENTRY_AVAILABLE" : "ENTRY_BLOCKED", detail: out.continue.enabled ? "continue-enabled" : "continue-disabled-without-prelaunch-text" };
  }
  return out;
}

/** Transport outcome before any page exists. A failure or 503 is never maintenance evidence by itself. */
export function classifyTransport(t) {
  if (t.error) return { stage: "TRANSPORT_FAILED", detail: t.error === "timeout" ? "timeout" : "network" };
  if (t.status === 429) return { stage: "RATE_LIMITED", detail: "http-429" };
  if (t.status === 401) return { stage: "SIGN_IN_REQUIRED", detail: "http-401" };
  if (t.status === 403) return { stage: "ACCESS_RESTRICTED", detail: "http-403" };
  if (t.status === 503) return { stage: "SERVICE_UNAVAILABLE", detail: "http-503-without-page-evidence" };
  if (t.status !== 200) return { stage: "TRANSPORT_FAILED", detail: "http-status" };
  return null;
}
