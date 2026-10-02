// Built-in FAKE examples for the browser rehearsal (C-006). Loading one only appends a new reviewed plan revision;
// it never replaces a non-FAKE plan, earlier revisions or a running run's bound plan. All values are invented.
import type { Plan } from "../plan.ts";
import { FAKE_PLAN } from "../mock/scenarios.ts";
import type { SiteScenario } from "../mock/live-site.ts";

export type Preset = { id: string; title: string; summary: string; scenario: SiteScenario; plan: Plan; requiresPlan: boolean };

const THREE_DATE_PLAN: Plan = {
  ...structuredClone(FAKE_PLAN),
  label: "FAKE 三日末档示例（虚构门店/日期；时段形状参照历史 Pro 页面）",
  stores: [{ label: "FAKE 门店甲", role: "primary" }],
  dates: ["2099-01-01", "2099-01-02", "2099-01-03"],
  windows: [{ start: "10:00", end: "21:30" }],
  arrival: { earliest: "10:00", latest: "21:30" },
  priority: ["date", "store", "window"],
  slotSelection: "last-offered-per-store-date",
  bounds: { ...FAKE_PLAN.bounds, minRefreshIntervalMs: 1000 },
};

export const PRESETS: Preset[] = [
  {
    id: "basic",
    title: "基础演练：首选被拒，用新列表改选",
    summary: "选中计划内最优先的时段 → 模拟官网明确拒绝 → 读取最新列表改选 → 被接受 → 继续到付款前",
    scenario: "refuse-then-accept",
    plan: structuredClone(FAKE_PLAN),
    // The original rehearsal runs with any plan that has no last-slot rule; it never forces a plan change.
    requiresPlan: false,
  },
  {
    id: "three-date-last",
    title: "三日末档演练：每天只选最晚时段",
    summary: "第 1 天最晚时段被拒并消失 → 不回退到当天更早时段，改选第 2 天最晚 → 再被拒 → 第 3 天最晚被接受 → 继续到付款前",
    scenario: "last-slot-three-dates",
    plan: THREE_DATE_PLAN,
    requiresPlan: true,
  },
];

export function presetById(id: unknown): Preset | null {
  return PRESETS.find((p) => p.id === id) ?? null;
}
/** The preset whose scenario must run with exactly its own plan (null when the scenario accepts any plan). */
export function requiredPresetFor(scenario: string): Preset | null {
  return PRESETS.find((p) => p.scenario === scenario && p.requiresPlan) ?? null;
}
