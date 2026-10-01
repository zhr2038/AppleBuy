// Independent regressions from actual Claude C-004 review. No network or real browser/session data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { CATALOG_URL, inspectPublicDom, inspectPublicHtml } from "../entry/public-entry.ts";

const NOW = Date.parse("2026-10-01T10:00:00Z");
const TITLE = "购买 iPhone Duo - Apple (中国大陆)";
const NOTICE = "9 月 9 日晚 8 点接受预购。9 月 19 日发售。";
const APPROVAL = "机型将在获得批准后发售";
const snapshot = () => ({ schema: "applebuy-public-dom/v1", provenance: "fixture", url: CATALOG_URL,
  observedAt: "2026-10-01T10:00:00Z", renderComplete: true, title: TITLE, productHeading: "iPhone Duo",
  continuePresent: true, continueEnabled: false, pickupUnavailable: true, notOnSale: true });

for (const wrapper of ["template", "noscript", "hidden", "aria-hidden"] as const) {
  test(`review C4-1: ${wrapper} content cannot establish a displayed sale/approval notice`, () => {
    const hidden = wrapper === "template" || wrapper === "noscript"
      ? `<${wrapper}>${NOTICE}<p>${APPROVAL}</p></${wrapper}>`
      : `<div ${wrapper === "hidden" ? "hidden" : 'aria-hidden="true"'}>${NOTICE}<p>${APPROVAL}</p></div>`;
    const result = inspectPublicHtml(`<html><head><title>${TITLE}</title></head><body><h1>iPhone Duo</h1>${hidden}</body></html>`, CATALOG_URL, NOW);
    assert.equal(result.publishedPreorderNotice, null);
    assert.equal(result.publishedApprovalCondition, null);
    assert.equal(result.purchaseReady, false);
  });
}

test("review C4-2: imported heading must be a string, never a coerced array or object", () => {
  for (const productHeading of [["iPhone Duo"], { toString: () => "iPhone Duo" }, null, 1]) {
    const result = inspectPublicDom({ ...snapshot(), productHeading }, NOW);
    assert.equal(result.status, "UNKNOWN_STRUCTURE");
    assert.equal(result.recognized, false);
  }
});

test("review C4-3: every offline source module stays structurally separate from public entry transport", () => {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) visit(path);
      else if (/\.(?:ts|js|mjs|cjs)$/.test(item.name)) files.push(path);
    }
  };
  visit(resolve("src"));
  assert.ok(files.length > 1);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["'][^"']*entry\//, `${file} imports a network-capable entry module`);
  }
});
