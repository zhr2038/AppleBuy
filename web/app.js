// Browser client. It never executes purchase logic: it only displays the executor's state and sends requests to
// the loopback service. No third-party scripts, fonts, images, cookies or browser storage.
import { renderApp } from "/render.js";

const token = document.querySelector('meta[name="session-token"]').content;
// A duplicated tab can inherit sessionStorage. Connection identities must be fresh per document; the durable
// purchase identity lives in the executor's task ledger and is unaffected by refresh or a new client id.
const clientId = `c-${[...crypto.getRandomValues(new Uint8Array(12))].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")}`;
const $ = (id) => document.getElementById(id);
let state = null;
let planDirty = false;

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
  $("view").innerHTML = renderApp(state);
  const renderMs = performance.now() - t0;
  document.title = `${state.engine?.phaseZh ?? ""}｜本机演练（FAKE）`;
  if (!planDirty && state.plan) $("plan").value = JSON.stringify(state.plan.plan, null, 2);
  if (state.plan) $("planHash").textContent = `v${state.plan.rev} ${state.plan.planHash}`;
  if (state.formal) $("phrase").textContent = state.formal.phrase;
  const sel = $("scenario");
  if (state.scenarios && sel.options.length === 0) for (const [id, text] of Object.entries(state.scenarios)) sel.add(new Option(`${id}：${text}`, id));
  const you = state.control?.you;
  for (const id of ["start", "recover", "resume", "savePlan", "arm"]) $(id).disabled = !you;
  $("claim").disabled = !!you;
  $("view").dataset.renderMs = renderMs.toFixed(3);
}

const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}&client=${encodeURIComponent(clientId)}`);
es.onmessage = (ev) => {
  state = JSON.parse(ev.data);
  paint();
};
es.onopen = () => msg("已连接本机执行进程。若需操作，请先“获取控制权”。");
es.onerror = () => msg("与本机执行进程的连接中断；浏览器会自动重连。", true);

$("claim").onclick = () => post("/api/claim");
$("start").onclick = () => post("/api/start", { scenario: $("scenario").value || "refuse-then-accept" });
$("recover").onclick = () => post("/api/recover");
for (const a of ["pause", "resume", "takeover", "stop"]) $(a).onclick = () => post("/api/control", { action: a });
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
