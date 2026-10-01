// Pure view renderer (no DOM access, no network). Used by the browser UI and, in Node, by the benchmark to time
// view generation separately from decision time. Every value is escaped; nothing from a page is trusted as HTML.

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function fmtTime(ms) {
  if (ms === null || ms === undefined) return "无";
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "无" : d.toLocaleTimeString("zh-CN", { hour12: false });
}

/** Engine status card: phase, reason, target, candidates, pending/unknown truth, last valid observation, counters. */
export function renderEngine(e, target) {
  const p = e.pendingOp;
  const pending = p
    ? `${esc(p.kind)} ${esc(p.opId)}${p.slotKey ? ` ${esc(p.slotKey)}` : ""} — ${p.status === "UNKNOWN" ? "<b class=warn>结果不明（只读核实，绝不重发）</b>" : p.status === "SENT" ? "已发送，等待模拟官网结果" : "已准备，发送前复核中"}`
    : "无";
  const cands = (e.candidates || []).length ? `<ol>${e.candidates.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>` : "<p>无（或尚无有效列表）</p>";
  return `<div class="card status ${e.needsHuman ? "human" : ""}">
<h2>当前步骤：${esc(e.phaseZh)}</h2>
${e.historical ? "<p class=warn>历史日志快照：本进程尚未重新观察，历史列表不会作为可操作候选。</p>" : ""}
<p>原因：${esc(e.reasonZh || "—")}</p>
<p>目标：${esc(target)}</p>
<p>已接受时段：${esc(e.acceptedSlot ?? "无")}；最近选择：${esc(e.lastChosen ?? "无")}</p>
<p>在途/不明操作：${pending}</p>
<p>最后有效观察：${fmtTime(e.lastValidObservationAt)}（${esc(e.lastObservationState || "—")}）</p>
<p>拒绝 ${esc(e.refusals)} 次｜有限刷新 ${esc(e.refreshes)} 次｜查询失败 ${esc(e.queryFailures)} 次｜已发送操作 ${esc(e.mutations)} 个｜恢复轮次 ${esc(e.epoch)}</p>
<p>需要人工：${e.needsHuman ? "<b class=warn>是</b>" : "否"}${e.paused ? "｜<b>已暂停：不会发起新动作</b>" : ""}</p>
<h3>候选时段（最新列表，按计划优先级）</h3>${cands}
</div>`;
}

/** The visibly fake mock site (mock contract v0, invented). */
export function renderSite(site) {
  const rows = site.slots.map((s) => `<tr class="${site.accepted === s.key ? "accepted" : ""}"><td>${esc(s.key)}</td><td>${s.selectable ? "可选" : "不可选"}</td></tr>`).join("");
  return `<div class="card site"><h2>模拟官网（FAKE｜${esc(site.contract)}｜不是 Apple 页面）</h2>
<p>场景：${esc(site.scenarioText)}</p>
<p>页面步骤：${esc(site.step)}｜页面序号 ${esc(site.seq)}｜引用标签 ${esc(site.refTag)}｜已接受：${esc(site.accepted ?? "无")}</p>
<table><thead><tr><th>时段（门店|日期|时间）</th><th>页面显示</th></tr></thead><tbody>${rows}</tbody></table>
<p class="small">模拟官网收到的调用：观察 ${esc(site.counts.observe)}｜选择 ${esc(site.counts.chooseSlot)}｜继续 ${esc(site.counts.advance)}｜提交 ${esc(site.counts.submitOrder)}｜订单查询 ${esc(site.counts.lookupOrder)}｜模拟订单记录 ${esc(site.orders)}</p></div>`;
}

export function renderTrace(lines) {
  return `<div class="card trace"><h2>诊断记录（脱敏，最近 ${lines.length} 条）</h2><pre>${lines.map(esc).join("\n")}</pre></div>`;
}

export function renderApp(s) {
  if (s.fatal) return `<div class="card human"><h2>状态不可用（失败即关闭）</h2><p>${esc(s.fatal)}</p></div>`;
  // The editor can contain a future revision while the executor remains bound to an older reviewed plan.
  const plan = s.run?.plan ?? s.plan.plan;
  const target = `${plan.products.map((p) => `${p.model} ${p.capacity} ${p.color}`).join(" / ")} @ ${plan.stores.map((x) => `${x.label}(${x.role === "primary" ? "首选" : "备选"})`).join(" / ")}`;
  const run = s.run
    ? `运行 ${esc(s.run.runId)}｜绑定计划 v${esc(s.run.rev)}${s.run.boundToCurrentPlan ? "" : "（当前编辑的是更新版本，不影响此运行）"}｜${s.run.capability ? "附带一次模拟正式授权" : "默认演练：不会提交"}`
    : "尚无运行";
  const ledger = s.ledger.entries ? `<b class=warn>购买台账：${s.ledger.corrupt ? "损坏（按结果不明处理）" : `已有最终提交记录（${esc(s.ledger.status)}）`}——此任务禁止再次提交</b>` : "购买台账：无提交记录";
  return `<div class="card meta">
<p>任务 ${esc(s.task.taskId)}｜执行进程 ${esc(s.owner.pid)}（${s.owner.previous === "crashed" ? "上一执行进程异常退出，已按日志恢复判定" : s.owner.previous === "clean" ? "上一执行进程正常退出" : "首次启动"}）｜控制权：${s.control.you ? "本标签页" : s.control.held ? "其他标签页（本页只读）" : "无人"}｜连接标签页 ${esc(s.control.clients)}</p>
<p>${run}｜${s.running ? "执行中" : "未执行"}${s.loopError ? `｜<b class=warn>执行器错误：${esc(s.loopError)}</b>` : ""}</p>
<p>${ledger}</p>
<p>模拟正式授权：${s.formal.armed ? (s.formal.used ? `已被运行 ${esc(s.formal.used)} 使用（不可重复使用）` : `已启用一次，等待下一次运行使用，过期时间 ${fmtTime(s.formal.expiresAt)}`) : "未启用（默认演练不能提交）"}｜真实正式模式：${esc(s.formal.liveMode)}</p>
${s.startBlocker ? `<p class=warn>不能开始新运行：${esc(s.startBlocker)}</p>` : ""}
${s.recoverBlocker ? "" : `<p class=warn>有可恢复的运行：请点击“恢复运行”（只读核实优先）</p>`}
</div>${renderEngine(s.engine, target)}${renderSite(s.site)}${renderTrace(s.trace)}`;
}
