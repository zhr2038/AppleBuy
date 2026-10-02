// Pure view renderer (no DOM access, no network). Used by the browser UI and, in Node, by the benchmark to time
// view generation separately from decision time. Every value is escaped; nothing from a page is trusted as HTML.
// Basic path: what this is, what to do next, the current business step and a short business history. Technical
// identifiers, hashes, raw slot keys, mock-site internals and the full trace live only in the advanced details.

import { runOutcome } from "./outcome.js";

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function fmtTime(ms) {
  if (ms === null || ms === undefined) return "无";
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "无" : d.toLocaleTimeString("zh-CN", { hour12: false });
}

const KIND_ZH = { chooseSlot: "选择时段", advance: "继续结账", submitOrder: "提交模拟订单", lookupOrder: "只读查询订单" };
const TERMINAL = new Set(["REHEARSAL_ENDPOINT", "ORDER_CONFIRMED_MOCK", "STOPPED", "EXHAUSTED", "BLOCKED", "MANUAL_VERIFICATION"]);
const btn = (act, text, attrs = "", cls = "") => `<button type="button" class="${cls}" data-act="${esc(act)}" ${attrs}>${esc(text)}</button>`;

/** Readable target/plan summary for a plan object (the run's bound plan, never a newer editor revision). */
export function planSummary(plan) {
  const products = plan.products.map((p) => `${p.model} ${p.capacity} ${p.color}`).join(" / ");
  const stores = plan.stores.map((x) => `${x.label}（${x.role === "primary" ? "首选" : "备选"}）`).join("、");
  const windows = plan.windows.map((w) => `${w.start}–${w.end}`).join("、");
  return `<dl class="summary">
<dt>计划</dt><dd>${esc(plan.label)}${plan.fake ? " <b class=fake>FAKE</b>" : ""}</dd>
<dt>商品</dt><dd>${esc(products)}，数量 1，总价上限 ¥${esc(plan.maxTotalCny)}</dd>
<dt>门店</dt><dd>${esc(stores)}（店内取货）</dd>
<dt>日期</dt><dd>${esc(plan.dates.join("、"))}</dd>
<dt>时间</dt><dd>时段须在 ${esc(windows)} 内，且在可到店 ${esc(plan.arrival.earliest)}–${esc(plan.arrival.latest)} 内</dd>
<dt>选择规则</dt><dd>${plan.slotSelection === "last-offered-per-store-date"
    ? "每个门店/日期只选最新列表中<b>最晚</b>的时段；它被拒绝或消失时，<b>不回退</b>到当天更早时段，而是看下一个授权日期。日期和最晚时间都取自列表，不预设"
    : "按计划优先级选择最早符合条件的时段；被拒后用最新列表改选"}</dd>
</dl>`;
}

const DEFAULT_RUN = "默认演练：到达模拟付款前步骤即停止，不提交任何订单（包括模拟订单）。";
/**
 * What the NEXT run may do with the one-use simulated formal capability (web/outcome.js, the same function the
 * executor checks at start). Shown next to every start action so the generic "stops before payment" copy can never
 * contradict an armed next run. `kind`/`armId` are sent with the start request; a mismatch is refused by the server.
 * Everything here is the local mock site: a mock final submission is never a real Apple order or payment.
 */
export function nextRunOutcome(s, now = Date.now()) {
  const o = runOutcome(s, now);
  const f = s.formal;
  const text = {
    default: DEFAULT_RUN,
    used: `本任务唯一一次模拟正式授权已被运行 ${f?.used ?? ""} 使用，不能再次启用。${DEFAULT_RUN}`,
    ledger: "本任务已有最终提交记录（或购买台账无法核对）：不能开始新的运行；已启用但未使用的模拟正式授权不会被领取，也不会再提交。",
    "plan-mismatch": "注意：已启用的一次性模拟正式授权属于另一个计划版本。下一次运行会领取并用掉它，但提交会被阻断，演练在付款前停止。",
    expired: "注意：已启用的一次性模拟正式授权已过期。下一次运行会领取并用掉它，但提交会被阻断，演练在付款前停止。",
    submits: `注意：已启用一次性模拟正式授权（${fmtTime(f?.expiresAt)} 前有效）。下一次运行如在此之前到达付款前步骤，会向本机模拟官网提交一单模拟订单（不是真实订单，也不能再次提交）。`,
  }[o.kind];
  return { ...o, submits: o.kind === "submits", cls: o.kind === "default" || o.kind === "used" ? "outcome" : "outcome formal", text };
}

/** Start button text for the outcome: primary panel or the advanced scenario button. */
export function startLabel(o, advanced = false) {
  const base = advanced ? "用当前计划开始此场景" : "开始演练";
  if (o.submits) return `${base}（会提交一单模拟订单）`;
  if (o.armId) return `${base}（会用掉模拟授权，但不会提交）`;
  return base;
}

/** Copy beside the advanced start button; the same outcome function as the primary panel. */
export function advancedStartCopy(s, now = Date.now()) {
  const o = nextRunOutcome(s, now);
  return { text: o.text, cls: o.cls, label: startLabel(o, true), expect: { kind: o.kind, armId: o.armId } };
}

/** "Start a new rehearsal" panel: examples and the plan a new run would use (the current plan revision). */
export function renderStart(s, ui = {}) {
  if (s.fatal || !s.examples) return "";
  const running = s.running;
  const you = s.control?.you ?? true;
  const pick = s.examples.find((x) => x.id === ui.example) ?? s.examples.find((x) => x.ready) ?? s.examples[0];
  const choices = s.examples.map((x) => `<label class="choice ${x.id === pick.id ? "on" : ""}"><input type="radio" name="example" value="${esc(x.id)}" ${x.id === pick.id ? "checked" : ""}> <b>${esc(x.title)}</b><span class="small">${esc(x.summary)}</span></label>`).join("");
  const outcome = nextRunOutcome(s);
  let action;
  if (running) action = `<p class="small">当前已有运行在进行：结束后才能开始新的演练。</p>`;
  else if (s.startBlocker) action = `<p class="warn">不能开始新演练：${esc(s.startBlocker)}</p>`;
  else if (!you) action = `<p class="small">本页只读：另一个标签页正在控制此任务。</p>`;
  else if (!pick.ready) action = pick.canLoad
    ? `<p class="small">此示例需要它自己的 FAKE 计划。载入会保存为新的计划版本（旧版本保留，正在运行的绑定不变），请核对后再开始。</p>${btn("preset", "载入此示例计划", `data-preset="${esc(pick.id)}"`, "primary")}`
    : `<p class="warn">当前计划不是 FAKE 演练计划：为避免替换你保存的计划，不能自动载入示例。</p>`;
  else action = `<p class="${outcome.cls}">${esc(outcome.text)}</p>${btn("start", startLabel(outcome), `data-scenario="${esc(pick.scenario)}"`, "primary big")}`;
  const plan = s.plan?.plan;
  const body = `<div class="choices">${choices}</div>
${plan ? `<h3>新演练将使用的计划（版本 v${esc(s.plan.rev)}）</h3>${planSummary(plan)}` : ""}
<div class="row">${action}</div>`;
  // While a run is active or recoverable, its step and controls come first; the next-run planner stays collapsed.
  if (running || !s.recoverBlocker) return `<details class="card start"><summary>开始新的演练（当前运行结束后可用）</summary>${body}</details>`;
  return `<section class="card start"><h2>开始一次演练</h2>${body}</section>`;
}

/** What the user should do now, derived only from displayed durable state. */
function nextStep(s, e) {
  if (s.loopError) return "执行已中断：请阅读上面的原因并人工检查；程序不会自动重发";
  if (s.ledger.problem) return "持久证据异常：请人工核对任务目录与订单状态，不要删除历史或新建任务重试";
  if (s.running) {
    if (e.pendingOp?.status === "UNKNOWN" || e.phase === "RECONCILING") return "结果不明：程序正在只读核实，绝不重发。请等待";
    if (e.needsHuman) return "需要你人工处理（见原因）。处理后可点“恢复”（先重新观察），或点“停止”";
    if (e.paused) return "已暂停：不会发起新动作。点“恢复”继续（先重新观察），或点“停止”";
    if (e.pendingOp?.status === "SENT") return "操作已发出，正在等待模拟官网结果：无需操作";
    return "自动进行中：无需操作。可随时暂停、人工接管或停止";
  }
  if (!s.recoverBlocker) return "有未完成的运行：点“恢复运行”。程序先从日志只读核实，已发出的操作不会重发";
  if (e.phase === "REHEARSAL_ENDPOINT") return "演练已到终点（模拟付款前，未提交订单）。可以在下方再开始一次新演练";
  if (e.phase === "ORDER_CONFIRMED_MOCK") return "模拟订单已确认（仅本机模拟，不是真实订单）；本任务不能再次提交";
  if (s.startBlocker) return "暂不能开始新演练：见上面的原因";
  return "在下方选择一个示例，然后点“开始演练”";
}

function pendingText(e) {
  const p = e.pendingOp;
  if (!p) return "无";
  const what = `${KIND_ZH[p.kind] ?? p.kind}${e.pendingSlotZh ? ` ${esc(e.pendingSlotZh)}` : ""}`;
  if (p.status === "UNKNOWN") return `<b class=warn>${what}：结果不明（只读核实，绝不重发）</b>`;
  if (p.status === "SENT") return `${what}：已发出，等待模拟官网结果${e.paused ? "（暂停不会撤回已发出的操作）" : ""}`;
  return `${what}：发送前复核中（尚未发出）`;
}

function controls(s, e) {
  const you = s.control ? s.control.you : true;
  const b = [];
  if (s.running && !TERMINAL.has(e.phase)) {
    if (e.paused || e.needsHuman) {
      if (you) b.push(btn("control", "恢复（先重新观察）", 'data-action="resume"', "primary"));
    } else b.push(btn("control", "暂停", 'data-action="pause"'), btn("control", "人工接管", 'data-action="takeover"'));
    b.push(btn("control", "停止", 'data-action="stop"', "danger"));
  }
  if (!s.running && !s.recoverBlocker && you) b.push(btn("recover", "恢复运行（先只读核实）", "", "primary"));
  return b.length ? `<div class="row">${b.join("")}</div>` : "";
}

/** Engine status card: business step, chosen/accepted slot, pending truth, next action and controls. */
export function renderEngine(e, target, s = null) {
  const cands = (e.candidatesZh ?? e.candidates ?? []);
  const head = s && !s.running && e.phase ? "上次运行（历史结果，不是新的运行）" : "当前运行";
  return `<section class="card status ${e.needsHuman ? "human" : ""}">
<h2>${esc(head)}：${esc(e.phaseZh)}</h2>
${e.historical ? "<p class=warn>历史日志快照：本进程尚未重新观察，历史列表不会作为可操作候选。</p>" : ""}
${s ? `<p class="next"><b>下一步：</b>${esc(nextStep(s, e))}</p>` : ""}
${s ? controls(s, e) : ""}
<dl class="summary">
<dt>原因</dt><dd>${esc(e.reasonZh || "—")}</dd>
<dt>目标</dt><dd>${esc(target)}</dd>
<dt>最近选择</dt><dd>${esc(e.lastChosenZh ?? e.lastChosen ?? "无")}</dd>
<dt>已接受</dt><dd>${esc(e.acceptedSlotZh ?? e.acceptedSlot ?? "无")}</dd>
<dt>在途操作</dt><dd>${pendingText(e)}</dd>
<dt>明确拒绝</dt><dd>${esc(e.refusals)} 次</dd>
<dt>最后有效观察</dt><dd>${fmtTime(e.lastValidObservationAt)}</dd>
<dt>需要人工</dt><dd>${e.needsHuman ? "<b class=warn>是</b>" : "否"}${e.paused ? "｜<b>已暂停：不会发起新动作</b>" : ""}</dd>
</dl>
${cands.length ? `<details><summary>当前列表中符合计划的候选（${cands.length}）</summary><ol>${cands.map((c) => `<li>${esc(c)}</li>`).join("")}</ol></details>` : ""}
</section>`;
}

/** The visibly fake mock site (mock contract v0, invented). Advanced details only. */
export function renderSite(site) {
  const rows = site.slots.map((s) => `<tr class="${site.accepted === s.key ? "accepted" : ""}"><td>${esc(s.key)}</td><td>${s.selectable ? "可选" : "不可选"}</td></tr>`).join("");
  return `<div class="site"><h3>模拟官网（FAKE｜${esc(site.contract)}｜不是 Apple 页面）</h3>
<p>场景：${esc(site.scenarioText)}</p>
<p>页面步骤：${esc(site.step)}｜页面序号 ${esc(site.seq)}｜引用标签 ${esc(site.refTag)}｜已接受：${esc(site.accepted ?? "无")}</p>
<div class="scroll"><table><thead><tr><th>时段（门店|日期|时间）</th><th>页面显示</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="small">模拟官网收到的调用：观察 ${esc(site.counts.observe)}｜选择 ${esc(site.counts.chooseSlot)}｜继续 ${esc(site.counts.advance)}｜提交 ${esc(site.counts.submitOrder)}｜订单查询 ${esc(site.counts.lookupOrder)}｜模拟订单记录 ${esc(site.orders)}</p></div>`;
}

export function renderTrace(lines) {
  return `<div class="trace"><h3>诊断记录（脱敏，最近 ${lines.length} 条）</h3><pre>${lines.map(esc).join("\n")}</pre></div>`;
}

/** Advanced details: identifiers, hashes, counters, mock-site internals and the full sanitized trace. */
export function renderAdvanced(s) {
  if (s.fatal) return "";
  const e = s.engine;
  const run = s.run ? `运行 ${esc(s.run.runId)}｜绑定计划 v${esc(s.run.rev)}（哈希 ${esc(s.run.planHash)}）${s.run.boundToCurrentPlan ? "" : "｜当前编辑的是更新版本，不影响此运行"}｜场景 ${esc(s.run.siteScenario)}` : "尚无运行";
  return `<p>任务 ${esc(s.task.taskId)}｜执行进程 ${esc(s.owner.pid)}（${s.owner.previous === "crashed" ? "上一执行进程异常退出，已按日志恢复判定" : s.owner.previous === "clean" ? "上一执行进程正常退出" : "首次启动"}）${s.control ? `｜连接标签页 ${esc(s.control.clients)}` : ""}</p>
<p>${run}</p>
<p>当前计划版本 v${esc(s.plan.rev)}（哈希 ${esc(s.plan.planHash)}，共 ${esc(s.plan.revisions)} 个版本）</p>
<p>有限刷新 ${esc(e.refreshes)} 次｜查询失败 ${esc(e.queryFailures)} 次｜已发送操作 ${esc(e.mutations)} 个｜恢复轮次 ${esc(e.epoch)}｜原始状态 ${esc(e.phase)} ${esc(e.reason)}</p>
<p>最近选择（原始）：${esc(e.lastChosen ?? "无")}；已接受（原始）：${esc(e.acceptedSlot ?? "无")}；最后观察状态：${esc(e.lastObservationState || "—")}</p>
<p>真实正式模式：${esc(s.formal.liveMode)}</p>
${renderSite(s.site)}${renderTrace(s.trace)}`;
}

export function renderApp(s, ui = {}) {
  if (s.fatal) return `<div class="card human"><h2>状态不可用（失败即关闭）</h2><p>${esc(s.fatal)}</p></div>`;
  // The status target always comes from the run's bound plan; a newer editor revision only affects future runs.
  const plan = s.run?.plan ?? s.plan.plan;
  const target = `${plan.products.map((p) => `${p.model} ${p.capacity} ${p.color}`).join(" / ")} @ ${plan.stores.map((x) => `${x.label}(${x.role === "primary" ? "首选" : "备选"})`).join(" / ")}`;
  // A run-evidence problem is not ledger damage: name the artifact actually at fault. When the check itself failed,
  // the ledger was not necessarily read, so it is not called readable.
  const problem = s.ledger.problem;
  const ledgerState = problem && (s.ledger.corrupt ? "损坏" : problem.cause === "evidence-unverifiable" ? "无法确认（核对过程异常）" : "文件可读，但与运行证据无法核对一致");
  const blockers = [];
  if (problem) blockers.push(`<b class=warn>购买台账：${ledgerState}（按结果不明处理）——此任务禁止再次提交</b><br><b class=warn>持久证据异常：${esc(problem.summaryZh)}</b>`);
  else if (s.ledger.entries) blockers.push(`<b class=warn>购买台账：已有最终提交记录（${esc(s.ledger.status)}）——此任务禁止再次提交</b>`);
  if (s.loopError) blockers.push(`<b class=warn>执行器错误：${esc(s.loopError)}</b>`);
  if (!s.running && s.startBlocker && !problem) blockers.push(`<span class=warn>不能开始新运行：${esc(s.startBlocker)}</span>`);
  // `control` exists only in the HTTP view (per-tab lease); a direct app.state() render has none.
  const c = s.control;
  const control = !c ? "" : c.you ? `<p class="small">本页正在控制此任务。</p>`
    : c.held ? `<p class="readonly">另一个标签页正在控制此任务：本页<b>只读</b>，不能开始或恢复；但可以暂停、人工接管或停止。</p>`
    : `<p class="readonly">当前没有标签页控制此任务。${btn("claim", "由本页控制")}</p>`;
  // A simulated formal authorization changes what a run may do: always visible, never only in advanced details.
  const f = s.formal;
  const formal = f.armed
    ? `<div class="card formal"><b>${esc(nextRunOutcome(s).text)}</b>只作用于本机模拟官网，不是真实订单；真实正式模式不可用。</div>`
    : "";
  const history = (s.history ?? []).length
    ? `<ol class="history">${s.history.map((h) => `<li><span class="small">${fmtTime(h.t)}</span> ${esc(h.text)}</li>`).join("")}</ol>`
    : "<p class=small>尚无记录</p>";
  return `${formal}${control}
${blockers.length ? `<section class="card blockers">${blockers.map((b) => `<p>${b}</p>`).join("")}</section>` : ""}
${renderEngine(s.engine, target, s)}
${ui.split ? "" : renderRunDetails(s, history, plan)}`;
}

/** Bound plan and short business history of the current/last run (placed after the start panel in the page). */
export function renderRunDetails(s, history = null, plan = s.run?.plan ?? s.plan?.plan) {
  if (s.fatal || !plan) return "";
  const h = history ?? ((s.history ?? []).length ? `<ol class="history">${s.history.map((x) => `<li><span class="small">${fmtTime(x.t)}</span> ${esc(x.text)}</li>`).join("")}</ol>` : "<p class=small>尚无记录</p>");
  return `<section class="card"><h2>运行计划${s.run ? `（此运行绑定 v${esc(s.run.rev)}）` : ""}</h2>${planSummary(plan)}${s.run && !s.run.boundToCurrentPlan ? `<p class="small">之后保存的计划只用于下一次新运行。</p>` : ""}</section>
<section class="card"><h2>最近经过</h2>${h}</section>`;
}
