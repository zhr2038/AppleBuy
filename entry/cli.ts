// Standalone, explicitly invoked C-004 public preflight. Never imported by the offline app.
import { openSync, fstatSync, readSync, closeSync } from "node:fs";
import { inspectPublicDom, readPublicEntry } from "./public-entry.ts";
import type { EntryReport } from "./public-entry.ts";

const STATUS_ZH: Record<EntryReport["status"], string> = {
  PUBLIC_CATALOG_ONLY: "已识别公开目录；尚未观察动态页面及控件",
  RENDERED_PRELAUNCH: "导入的公开页面观察显示未开售、取货不可用、继续禁用",
  RENDERED_ENTRY_ONLY: "已识别导入的公开页面观察；结账机制仍未验证",
  RENDERING_INCOMPLETE: "页面尚未完成加载，不能推断无货或取货状态",
  STALE_OBSERVATION: "导入观察已过期，需要新的只读页面观察",
  UNKNOWN_STRUCTURE: "无法识别页面或观察结构；不能推断无货",
  RETRIEVAL_FAILED: "公开入口读取失败；不能推断无货",
  RATE_LIMITED: "官网限流；已停止，不自动重试",
  AUTH_REQUIRED: "需要用户认证；已停止，不自动登录",
  ACCESS_RESTRICTED: "官网拒绝访问；已停止，不绕过限制",
  REDIRECT_BLOCKED: "入口返回重定向；未跟随或扩展访问范围",
};

const BLOCKER_ZH: Record<string, string> = {
  "real-user-plan-not-loaded": "尚未加载用户真实购买计划",
  "checkout-sku-and-store-binding-unverified": "结账商品标识与官方门店绑定尚未核实",
  "duo-slot-and-order-contracts-unverified": "Duo 自提时段及订单确认机制尚未验证",
  "real-operation-not-enabled": "真实操作尚未启用",
  "hydrated-page-and-controls-not-observed": "尚未观察完成加载的页面及控件",
  "document-head-unrecognized": "页面文档结构无法识别",
  "page-render-incomplete": "页面加载尚未完成",
  "public-observation-stale": "公开页面观察已过期",
  "continue-control-disabled": "继续按钮禁用",
  "public-entry-pickup-unavailable": "该公开入口当前不提供直营店自提",
  "public-entry-not-on-sale": "公开入口显示尚未发售",
  "continue-control-not-observed": "尚未观察到继续按钮",
  "fixture-is-not-real-evidence": "虚构用例不能作为真实证据",
  "imported-provenance-requires-independent-verification": "导入数据的来源声明须独立核实",
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "--help" || argv.length === 0) {
    console.log("仅公开入口只读预检；不是库存监控或自动购买，真实操作不可用。\n" +
      "用法：node entry/cli.ts inspect [--example] [--json]\n" +
      "      node entry/cli.ts inspect --snapshot <脱敏公开页面观察.json> [--json]\n" +
      "联网模式仅发一次 GET；目录或已观察的示例规格，不携带认证、不跟随重定向、不重试。\n" +
      "--snapshot 为离线导入，来源声明须独立核实；不发送网络请求。");
    return;
  }
  let snapshot: string | null = null;
  let example = false;
  let json = false;
  let invalid = argv[0] !== "inspect";
  for (let i = 1; i < argv.length; i++) {
    const option = argv[i];
    if (option === "--example" && !example) example = true;
    else if (option === "--json" && !json) json = true;
    else if (option === "--snapshot" && snapshot === null && argv[i + 1] && !argv[i + 1].startsWith("--")) snapshot = argv[++i];
    else invalid = true;
  }
  if (invalid || (snapshot !== null && example)) {
    console.error("参数无效。运行 --help 查看用法；未发送网络请求。");
    process.exitCode = 2;
    return;
  }
  let result: EntryReport;
  if (snapshot !== null) {
    try {
      const fd = openSync(snapshot, "r");
      let raw: string;
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size > 4096) throw new Error("snapshot-too-large-or-not-file");
        const bytes = Buffer.alloc(4097);
        const read = readSync(fd, bytes, 0, bytes.length, 0);
        if (read > 4096) throw new Error("snapshot-too-large");
        raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, read));
      } finally { closeSync(fd); }
      result = inspectPublicDom(JSON.parse(raw));
    } catch {
      console.error("公开页面观察文件无法读取或解析。原始内容未输出；未发送网络请求。");
      process.exitCode = 2;
      return;
    }
  } else result = await readPublicEntry(example ? "observed-example" : "catalog");
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log("【公开入口只读预检｜真实购买尚未实现且未启用】");
    console.log(STATUS_ZH[result.status]);
    const source = result.provenance === "direct-public-html" ? "本次只读获取的公开页面原文" : "导入的脱敏公开页面观察";
    console.log(`来源：${source}；检查时间：${result.checkedAt}；观察时间：${result.observedAt ?? "无有效观察"}`);
    if (result.url) console.log(`公开入口：${result.url}`);
    if (result.title) console.log(`目录标题：${result.title}`);
    if (result.publishedPreorderNotice) console.log(`官网原文日期：${result.publishedPreorderNotice}（未推断年份或时区）`);
    if (result.provenanceClaim) console.log(`导入来源声明：${result.provenanceClaim === "fixture" ? "虚构用例" : "实际浏览器"}（须独立核实）`);
    console.log(`真实计划：未加载；结账商品/门店/时段机制：未验证；真实操作：不可用。\n阻断项：${result.blockers.map(k => BLOCKER_ZH[k] ?? "尚有未验证项").join("、")}`);
  }
  // Exit 0 only means a bounded entry observation was recognized. purchaseReady is always false.
  process.exitCode = result.recognized ? 0 : 1;
}

main().catch(() => {
  console.error("只读预检异常，已停止；不能据此判断无货或可购买。");
  process.exitCode = 1;
});
