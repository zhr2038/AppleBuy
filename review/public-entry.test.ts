// Codex-authored C-004 quota-takeover verification. Actual independent Claude review remains required.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CATALOG_URL, OBSERVED_EXAMPLE_URL, MAX_BODY_BYTES, SNAPSHOT_MAX_AGE_MS,
  inspectPublicHtml, inspectPublicDom, readPublicEntry } from "../entry/public-entry.ts";
import { installNetworkGuard } from "../src/netguard.ts";
import { tempDir } from "../test/helpers.ts";

const TITLE = "购买 iPhone Duo 512GB 夜空色 - Apple (中国大陆)";
const T = Date.parse("2026-10-01T10:00:00Z");
const HTML = `<html><head><title>${TITLE}</title></head><body><h1>iPhone&nbsp;Duo</h1>
  <p>10 月 16 日晚 8 点接受预购。10 月 23 日发售。</p><p>机型将在获得批准后发售</p>
  <script>const hidden = '目前暂不提供 Apple Store 零售店取货服务';</script></body></html>`;

function snapshot() {
  return { schema: "applebuy-public-dom/v1", provenance: "fixture", url: OBSERVED_EXAMPLE_URL,
    observedAt: "2026-10-01T10:00:00Z", renderComplete: true, title: TITLE, productHeading: "iPhone Duo",
    continuePresent: true, continueEnabled: false, pickupUnavailable: true, notOnSale: true };
}

test("C-004: recognized public HTML never infers dynamic controls, stock or real readiness", () => {
  const result = inspectPublicHtml(HTML, OBSERVED_EXAMPLE_URL, T);
  assert.equal(result.status, "PUBLIC_CATALOG_ONLY");
  assert.equal(result.recognized, true);
  assert.equal(result.provenance, "imported-public-html");
  assert.equal(result.observedAt, null, "a pure parse cannot assert when a network observation occurred");
  assert.equal(result.continueEnabled, null);
  assert.equal(result.pickupUnavailable, null, "script text is not a rendered pickup signal");
  assert.equal(result.notOnSale, null);
  assert.equal(result.checkoutSkuVerified, false);
  assert.equal(result.configuration, "NOT_LOADED");
  assert.equal(result.purchaseReady, false);
  assert.equal(result.realMutationsAvailable, false);
  assert.equal(result.catalogUrlIdentifier, "mk2q4ch/a");
  assert.equal(result.publishedPreorderNotice, "10 月 16 日晚 8 点接受预购。10 月 23 日发售。");
  assert.ok(result.publishedApprovalCondition);
  assert.equal(inspectPublicHtml(HTML.replace("机型将在获得批准后发售", ""), OBSERVED_EXAMPLE_URL, T).publishedApprovalCondition, null);
  assert.match(result.bodySha256 ?? "", /^[a-f0-9]{64}$/);
});

test("C-004: wrong product/variant, ambiguous headings, empty shell and hidden signals fail closed", () => {
  const variants = ["", "<html><body><div id='root'></div></body></html>",
    HTML.replace("iPhone&nbsp;Duo", "iPhone 18 Pro"), HTML.replace("512GB 夜空色", "256GB 星光白色"),
    HTML + "<h1>iPhone Duo</h1>", `<script>${HTML}</script>`,
    HTML.replace(TITLE, "private-cookie=secret"), HTML.replace("<h1>", "<!--<h1>").replace("</h1>", "</h1>-->")];
  for (const html of variants) {
    const result = inspectPublicHtml(html, OBSERVED_EXAMPLE_URL, T);
    assert.equal(result.status, "UNKNOWN_STRUCTURE");
    assert.equal(result.recognized, false);
    assert.equal(result.title, null);
    assert.equal(result.purchaseReady, false);
    assert.ok(!JSON.stringify(result).includes("private-cookie"));
  }
  assert.equal(inspectPublicHtml(HTML, OBSERVED_EXAMPLE_URL + "?cookie=secret", T).url, null);
});

test("C-004 live reproduction: SVG icon titles do not conflict with the sole document title", () => {
  const withIcons = HTML.replace("</body>", "<svg><title>取货</title></svg><svg><title>Icon</title></svg></body>");
  assert.equal(inspectPublicHtml(withIcons, OBSERVED_EXAMPLE_URL, T).status, "PUBLIC_CATALOG_ONLY");
  const duplicateHeadTitle = HTML.replace("</head>", "<title>Second document</title></head>");
  assert.equal(inspectPublicHtml(duplicateHeadTitle, OBSERVED_EXAMPLE_URL, T).status, "UNKNOWN_STRUCTURE");
});

test("C-004: complete prelaunch DOM is recognized as imported evidence, never final readiness", () => {
  const result = inspectPublicDom(snapshot(), T);
  assert.equal(result.status, "RENDERED_PRELAUNCH");
  assert.equal(result.recognized, true);
  assert.equal(result.provenanceClaim, "fixture");
  assert.equal(result.publishedApprovalCondition, null, "not included in imported DOM fields, so not observed");
  assert.equal(result.purchaseReady, false);
  assert.equal(result.realMutationsAvailable, false);
  assert.ok(result.blockers.includes("fixture-is-not-real-evidence"));
  assert.ok(result.blockers.includes("imported-provenance-requires-independent-verification"));
});

test("C-004: incomplete render, stale observation and absent controls do not imply unavailable stock", () => {
  const incomplete = inspectPublicDom({ ...snapshot(), renderComplete: false }, T);
  assert.equal(incomplete.status, "RENDERING_INCOMPLETE");
  assert.equal(incomplete.recognized, false);
  assert.equal(incomplete.pickupUnavailable, null);
  const stale = inspectPublicDom(snapshot(), T + SNAPSHOT_MAX_AGE_MS + 1);
  assert.equal(stale.status, "STALE_OBSERVATION");
  assert.equal(stale.pickupUnavailable, null);
  const absent = inspectPublicDom({ ...snapshot(), continuePresent: false, continueEnabled: null,
    pickupUnavailable: null, notOnSale: null }, T);
  assert.equal(absent.status, "RENDERED_ENTRY_ONLY");
  assert.equal(absent.pickupUnavailable, null);
  assert.ok(absent.blockers.includes("continue-control-not-observed"));
});

test("C-004: apparently enabled public controls still cannot authorize real actions", () => {
  const result = inspectPublicDom({ ...snapshot(), provenance: "actual-browser", continueEnabled: true,
    pickupUnavailable: false, notOnSale: false }, T);
  assert.equal(result.status, "RENDERED_ENTRY_ONLY");
  assert.equal(result.purchaseReady, false);
  assert.equal(result.checkoutSkuVerified, false);
  assert.equal(result.slotContractVerified, false);
  assert.equal(result.realMutationsAvailable, false);
});

test("C-004: unexpected/secret fields, invalid dates, mismatched target and contradictory controls are rejected", () => {
  for (const input of [null, [], { ...snapshot(), cookie: "PRIVATE" }, { ...snapshot(), observedAt: "bad" },
    { ...snapshot(), observedAt: "2026-02-30T10:00:00Z" }, { ...snapshot(), observedAt: "2026-10-01T11:00:00Z" },
    { ...snapshot(), title: "PRIVATE" }, { ...snapshot(), url: "https://secure.www.apple.com.cn/shop/bag" },
    { ...snapshot(), continuePresent: false, continueEnabled: false }, { ...snapshot(), pickupUnavailable: "false" },
    { ...snapshot(), productHeading: "iPhone 18 Pro" }]) {
    const result = inspectPublicDom(input, T);
    assert.equal(result.status, "UNKNOWN_STRUCTURE");
    assert.equal(result.purchaseReady, false);
    assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  }
});

async function withTransport(response: Response | Error, run: (calls: { url: unknown; init: RequestInit | undefined }[]) => Promise<void>) {
  const original = globalThis.fetch;
  const calls: { url: unknown; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  try { await run(calls); } finally { globalThis.fetch = original; }
}

test("C-004: one credential-free GET to an observed public URL, without redirect following or retries", async () => {
  await withTransport(new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } }), async calls => {
    const result = await readPublicEntry("observed-example");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, OBSERVED_EXAMPLE_URL);
    assert.equal(calls[0].init?.method, "GET");
    assert.equal(calls[0].init?.redirect, "manual");
    assert.equal(calls[0].init?.credentials, "omit");
    assert.equal(calls[0].init?.referrerPolicy, "no-referrer");
    assert.deepEqual(calls[0].init?.headers, { Accept: "text/html" });
    assert.ok(calls[0].init?.signal instanceof AbortSignal);
    assert.equal(result.status, "PUBLIC_CATALOG_ONLY");
    assert.equal(result.provenance, "direct-public-html");
    assert.ok(result.observedAt);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.purchaseReady, false);
  });
});

test("C-004: redirect, access denial, authentication, throttle and failure remain distinct and make no second call", async () => {
  const cases = [[302, "REDIRECT_BLOCKED"], [401, "AUTH_REQUIRED"], [403, "ACCESS_RESTRICTED"],
    [429, "RATE_LIMITED"], [503, "RETRIEVAL_FAILED"]] as const;
  for (const [status, expected] of cases) {
    await withTransport(new Response("PRIVATE", { status, headers: { Location: "https://secure.www.apple.com.cn/shop/bag?secret=PRIVATE" } }), async calls => {
      const result = await readPublicEntry();
      assert.equal(calls[0].url, CATALOG_URL);
      assert.equal(calls.length, 1);
      assert.equal(result.status, expected);
      assert.equal(result.httpStatus, status);
      assert.equal(result.pickupUnavailable, null);
      assert.equal(result.purchaseReady, false);
      assert.ok(!JSON.stringify(result).includes("PRIVATE"));
    });
  }
});

test("C-004: network timeout/error and challenge HTML do not leak raw content or mean no stock", async () => {
  await withTransport(new Error("PRIVATE cookie=secret"), async calls => {
    const result = await readPublicEntry();
    assert.equal(calls.length, 1);
    assert.equal(result.status, "RETRIEVAL_FAILED");
    assert.equal(result.pickupUnavailable, null);
    assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  });
  await withTransport(new Response("<html><title>Verify PRIVATE</title></html>", { headers: { "content-type": "text/html" } }), async calls => {
    const result = await readPublicEntry();
    assert.equal(calls.length, 1);
    assert.equal(result.status, "UNKNOWN_STRUCTURE");
    assert.equal(result.title, null);
    assert.equal(result.pickupUnavailable, null);
  });
});

test("C-004: invalid entry and non-HTML/oversized response fail closed before any further access", async () => {
  await withTransport(new Response("{}", { headers: { "content-type": "application/json" } }), async calls => {
    assert.equal((await readPublicEntry("other" as "catalog")).status, "UNKNOWN_STRUCTURE");
    assert.equal(calls.length, 0);
    assert.equal((await readPublicEntry()).status, "UNKNOWN_STRUCTURE");
    assert.equal(calls.length, 1);
  });
  await withTransport(new Response("x".repeat(MAX_BODY_BYTES + 1), { headers: { "content-type": "text/html" } }), async calls => {
    assert.equal((await readPublicEntry()).status, "UNKNOWN_STRUCTURE");
    assert.equal(calls.length, 1);
  });
});

test("C-004: the existing offline guard still rejects the public preflight before transport", async () => {
  await withTransport(new Response(HTML), async calls => {
    const guard = installNetworkGuard();
    try {
      assert.equal((await readPublicEntry()).status, "RETRIEVAL_FAILED");
      assert.equal(calls.length, 0);
      assert.equal(guard.attempts.length, 1);
    } finally { guard.uninstall(); }
  });
  const cli = readFileSync(resolve("src/cli.ts"), "utf8");
  assert.ok(!cli.includes("entry/"), "offline CLI cannot import the public preflight");
});

test("C-004: real CLI imports only a sanitized snapshot, rejects unknown options and never attempts network", () => {
  const fixture = tempDir("public-entry-cli");
  const cli = resolve("entry/cli.ts");
  const preload = pathToFileURL(resolve("review/fixtures/deny-network.ts")).href;
  try {
    const file = join(fixture.dir, "public.json");
    writeFileSync(file, JSON.stringify({ ...snapshot(), observedAt: new Date().toISOString() }));
    const result = JSON.parse(execFileSync(process.execPath, ["--import", preload, cli, "inspect", "--snapshot", file, "--json"],
      { windowsHide: true, timeout: 5000, encoding: "utf8" }));
    assert.equal(result.status, "RENDERED_PRELAUNCH");
    assert.equal(result.provenance, "imported-public-dom");
    assert.equal(result.provenanceClaim, "fixture");
    assert.equal(result.purchaseReady, false);
    assert.throws(() => execFileSync(process.execPath, ["--import", preload, cli, "inspect", "--url", "https://example.invalid"],
      { windowsHide: true, timeout: 5000, encoding: "utf8", stdio: "pipe" }), (e: unknown) => (e as { status?: number }).status === 2);
    writeFileSync(file, "PRIVATE".repeat(1000));
    assert.throws(() => execFileSync(process.execPath, ["--import", preload, cli, "inspect", "--snapshot", file],
      { windowsHide: true, timeout: 5000, encoding: "utf8", stdio: "pipe" }), (e: unknown) => {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return err.status === 2 && !String(err.stdout).includes("PRIVATE") && !String(err.stderr).includes("PRIVATE");
    });
  } finally { fixture.cleanup(); }
});
