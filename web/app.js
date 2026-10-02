// Browser client. It never executes purchase logic: it only displays the executor's state and sends requests to
// the loopback service. No third-party scripts, fonts, images, cookies or browser storage.
import { nextRunOutcome, renderAdvanced, renderApp, renderRunDetails, renderStart } from "/render.js";

const token = document.querySelector('meta[name="session-token"]').content;
// A duplicated tab can inherit sessionStorage. Connection identities must be fresh per document; the durable
// purchase identity lives in the executor's task ledger and is unaffected by refresh or a new client id.
const clientId = `c-${[...crypto.getRandomValues(new Uint8Array(12))].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")}`;
const $ = (id) => document.getElementById(id);
let state = null;
let planDirty = false;
let autoClaimTried = false;
let displayedOutcome = null;
const ui = { example: null };

function msg(text, bad = false) {
  $("msg").textContent = text;
  $("msg").className = bad ? "msg warn" : "msg";
}

async function post(path, body = {}) {
  try {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-session-token": token, "x-client-id": clientId }, body: JSON.stringify(body) });
    const j = await r.json();
    msg(j.message || (j.ok ? "完成" : `失败：${j.code}`), !j.ok);
    return j;
  } catch {
    msg("无法连接本机执行进程（可能已退出）。重新启动程序后刷新本页。", true);
    return null;
  }
}

function paint() {
  if (!state) return;
  const t0 = performance.now();
  // Order: current/last run step and controls, then the (collapsed while active) next-run planner, then details.
  $("view").innerHTML = renderApp(state, { ...ui, split: true });
  $("start").innerHTML = renderStart(state, ui);
  $("details").innerHTML = renderRunDetails(state);
  if (!state.fatal && state.formal) {
    const o = nextRunOutcome(state);
    displayedOutcome = o.text;
    $("advOutcome").textContent = o.text;
    $("advOutcome").className = o.cls;
    $("startAdvanced").textContent = o.submits ? "用当前计划开始此场景（会提交一单模拟订单）" : "用当前计划开始此场景";
  }
  // Re-render the advanced panel only while it is open: closed details cost nothing and keep the page light.
  if ($("advanced").open) $("advView").innerHTML = renderAdvanced(state);
  const renderMs = performance.now() - t0;
  document.title = `${state.engine?.phaseZh ?? ""}｜本机演练（FAKE）`;
  if (!planDirty && state.plan) $("plan").value = JSON.stringify(state.plan.plan, null, 2);
  if (state.plan) $("planHash").textContent = `v${state.plan.rev} ${state.plan.planHash}`;
  if (state.formal) $("phrase").textContent = state.formal.phrase;
  const sel = $("scenario");
  if (state.scenarios && sel.options.length === 0) for (const [id, text] of Object.entries(state.scenarios)) sel.add(new Option(text, id));
  const you = state.control?.you;
  for (const id of ["startAdvanced", "savePlan", "arm"]) $(id).disabled = !you;
  $("view").dataset.renderMs = renderMs.toFixed(3);
}

const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}&client=${encodeURIComponent(clientId)}`);
es.onmessage = (ev) => {
  state = JSON.parse(ev.data);
  paint();
  // Basic operation needs no separate ownership step: take the lease once if nobody holds it. The service still
  // enforces one controlling tab; a tab opened while another controls stays read-only and never takes over.
  // Decided once, on this page's first state: a read-only tab never claims later when the other tab goes away.
  if (!autoClaimTried && state.control) {
    autoClaimTried = true;
    if (!state.control.held) void post("/api/claim");
  }
};
es.onopen = () => msg("已连接本机执行进程。");
es.onerror = () => msg("与本机执行进程的连接中断；浏览器会自动重连。", true);

// An idle page must still show expiration. Repaint only when the effective outcome changes.
function refreshOutcome() {
  if (state?.formal && nextRunOutcome(state).text !== displayedOutcome) paint();
}
setInterval(refreshOutcome, 1000);
window.addEventListener("focus", refreshOutcome);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshOutcome(); });
function startScenario(scenario) {
  if (state?.formal && nextRunOutcome(state).text !== displayedOutcome) {
    paint();
    msg("授权状态已变化，请核对开始按钮旁的最新说明，再点开始。", true);
    return null;
  }
  return post("/api/start", { scenario });
}

// One delegated handler for the re-rendered basic panels.
document.addEventListener("click", (ev) => {
  const b = ev.target.closest?.("button[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "start") void startScenario(b.dataset.scenario);
  else if (act === "preset") void post("/api/preset", { preset: b.dataset.preset });
  else if (act === "recover") void post("/api/recover");
  else if (act === "claim") void post("/api/claim");
  else if (act === "control") void post("/api/control", { action: b.dataset.action });
});
document.addEventListener("change", (ev) => {
  if (ev.target.name === "example") {
    ui.example = ev.target.value;
    paint();
  }
});
$("advanced").addEventListener("toggle", () => paint());
$("startAdvanced").onclick = () => startScenario($("scenario").value || "refuse-then-accept");
$("plan").oninput = () => {
  planDirty = true;
};
$("reloadPlan").onclick = () => {
  planDirty = false;
  paint();
};
$("savePlan").onclick = async () => {
  let plan;
  try {
    plan = JSON.parse($("plan").value);
  } catch {
    return msg("计划不是有效的 JSON", true);
  }
  const r = await post("/api/plan", { plan });
  if (r && r.ok) planDirty = false;
};
$("arm").onclick = () => {
  if (!$("reviewed").checked) return msg("请先勾选“我已核对当前计划版本”", true);
  return post("/api/formal", { planHash: state?.plan?.planHash ?? "", phrase: $("phraseInput").value });
};
