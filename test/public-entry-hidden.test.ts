// C-003-R2 / C4-1, C4-2: explicitly hidden markup cannot supply positive public signals; imported headings must be
// strings. Offline fixtures only: no network, no browser. Recognition is never readiness, stock, SKU or slots.
import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG_URL, inspectPublicDom, inspectPublicHtml } from "../entry/public-entry.ts";

const NOW = Date.parse("2026-10-01T10:00:00Z");
const TITLE = "购买 iPhone Duo - Apple (中国大陆)";
const NOTICE = "9 月 9 日晚 8 点接受预购。9 月 19 日发售。";
const APPROVAL = "机型将在获得批准后发售";
const page = (body: string, head = `<title>${TITLE}</title>`) => `<html><head>${head}</head><body>${body}</body></html>`;

function assertNeverReady(r: ReturnType<typeof inspectPublicHtml>): void {
  assert.equal(r.purchaseReady, false);
  assert.equal(r.realMutationsAvailable, false);
  assert.equal(r.slotContractVerified, false);
  assert.equal(r.checkoutSkuVerified, false);
  assert.equal(r.configuration, "NOT_LOADED");
  assert.equal(r.continueEnabled, null);
  assert.equal(r.pickupUnavailable, null);
  assert.equal(r.notOnSale, null);
  assert.notEqual(r.status, "RENDERED_PRELAUNCH", "HTML alone never attests rendered controls");
}

test("C4-1: displayed content after a closed hidden subtree is still read; nested same-name tags close correctly", () => {
  const after = inspectPublicHtml(page(`<h1>iPhone Duo</h1><div hidden><div>x</div></div><p>${NOTICE}</p><p>${APPROVAL}</p>`), CATALOG_URL, NOW);
  assert.equal(after.status, "PUBLIC_CATALOG_ONLY");
  assert.equal(after.publishedPreorderNotice, NOTICE);
  assert.equal(after.publishedApprovalCondition, true);
  assertNeverReady(after);

  const nested = inspectPublicHtml(page(`<h1>iPhone Duo</h1><div hidden><div>inner</div>${NOTICE}</div><p>${APPROVAL}</p>`), CATALOG_URL, NOW);
  assert.equal(nested.publishedPreorderNotice, null, "text after a nested closing tag is still inside the hidden parent");
  assert.equal(nested.publishedApprovalCondition, true);
  assertNeverReady(nested);
});

test("C4-1: inline display:none / visibility:hidden and a non-void self-closing hidden element hide their content", () => {
  for (const wrapper of [`<div style="color:red; display : none !important">`, `<section style='visibility:hidden'>`, `<div hidden/>`]) {
    const close = wrapper.startsWith("<section") ? "</section>" : "</div>";
    const r = inspectPublicHtml(page(`<h1>iPhone Duo</h1>${wrapper}${NOTICE}<p>${APPROVAL}</p>${close}`), CATALOG_URL, NOW);
    assert.equal(r.publishedPreorderNotice, null, wrapper);
    assert.equal(r.publishedApprovalCondition, null, wrapper);
    assertNeverReady(r);
  }
});

test("C4-1: attribute names merely containing 'hidden' are not the hidden attribute (class CSS stays unknown, not inferred)", () => {
  const r = inspectPublicHtml(page(`<h1>iPhone Duo</h1><div class="hidden" data-hidden="true" aria-hidden="false">${NOTICE}<p>${APPROVAL}</p></div>`), CATALOG_URL, NOW);
  assert.equal(r.publishedPreorderNotice, NOTICE);
  assert.equal(r.publishedApprovalCondition, true);
  assert.ok(r.blockers.includes("hydrated-page-and-controls-not-observed"));
  assertNeverReady(r);
});

test("C4-1: hidden heading or template title cannot establish the public entry", () => {
  const heading = inspectPublicHtml(page(`<h1 hidden>iPhone Duo</h1><p>${NOTICE}</p>`), CATALOG_URL, NOW);
  assert.equal(heading.status, "UNKNOWN_STRUCTURE");
  assert.equal(heading.recognized, false);
  assert.equal(heading.publishedPreorderNotice, null);
  const title = inspectPublicHtml(page(`<h1>iPhone Duo</h1><p>${NOTICE}</p>`, `<template><title>${TITLE}</title></template>`), CATALOG_URL, NOW);
  assert.equal(title.status, "UNKNOWN_STRUCTURE");
  assert.equal(title.recognized, false);
});

test("C4-1: an unclosed hidden element drops the rest of the document (fewer positive signals, never more)", () => {
  const r = inspectPublicHtml(`<html><head><title>${TITLE}</title></head><body><h1>iPhone Duo</h1><noscript>${NOTICE}<p>${APPROVAL}</p></body></html>`, CATALOG_URL, NOW);
  assert.equal(r.publishedPreorderNotice, null);
  assert.equal(r.publishedApprovalCondition, null);
  assertNeverReady(r);
});

test("C4-1: aria-hidden SVG icons with self-closing children do not swallow following displayed content", () => {
  const r = inspectPublicHtml(page(`<svg aria-hidden="true"><title>取货</title><path d="M0 0"/><g/></svg><h1>iPhone Duo</h1><svg><path d="M1 1"/></svg><p>${NOTICE}</p><p>${APPROVAL}</p>`), CATALOG_URL, NOW);
  assert.equal(r.status, "PUBLIC_CATALOG_ONLY");
  assert.equal(r.publishedPreorderNotice, NOTICE);
  assert.equal(r.publishedApprovalCondition, true);
  assertNeverReady(r);
});

test("C4-2: a real string heading (with a non-breaking space) is still accepted; a String object is not", () => {
  const snapshot = { schema: "applebuy-public-dom/v1", provenance: "fixture", url: CATALOG_URL, observedAt: "2026-10-01T10:00:00Z",
    renderComplete: true, title: TITLE, productHeading: "iPhone Duo", continuePresent: true, continueEnabled: false, pickupUnavailable: true, notOnSale: true };
  const ok = inspectPublicDom(snapshot, NOW);
  assert.equal(ok.recognized, true);
  assert.equal(ok.purchaseReady, false);
  assert.equal(ok.realMutationsAvailable, false);
  const boxed = inspectPublicDom({ ...snapshot, productHeading: new String("iPhone Duo") }, NOW);
  assert.equal(boxed.status, "UNKNOWN_STRUCTURE");
  assert.equal(boxed.recognized, false);
});
