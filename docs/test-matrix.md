# 需求与验证对应表

C-002 已独立验收；C-003 仍是待 Claude 交叉审查的离线候选。测试范围均为虚构页面/端口，不证明 Apple 接口。

| 标准 | 验证位置与内容 |
| --- | --- |
| A01 / A02 / R01-R04 | `test/scenarios.test.ts`、`test/app-core.test.ts`：完整首拒、新列表、新引用、不同授权时段、接受后继续、默认零提交；真实浏览器也操作验证本机全流程 |
| A03 | `test/scenarios.test.ts`：拒绝/刷新/单时段尝试上限、重复旧列表停止 |
| A04 | `test/observe.test.ts`：查询失败、未知结构、缺字段不解释为无货或成功 |
| A05 | `test/scenarios.test.ts`、`review/queued-action.test.ts`：重复/乱序事件、替换引用、发送前重新复核 |
| A06 / R01 | `test/plan-guard.test.ts`、`review/plan-binding.test.ts`：门店/日期/到店时间/规格/数量/方式/价格越界与计划冻结 |
| A07 / R07 | `test/app-core.test.ts`、`test/app-process.test.ts`、`review/app-handoff.test.ts`：未知提交只读核实、重启/改计划不重复提交、台账缺失/清空不能绕过历史 |
| A08 | `test/app-process.test.ts`、`review/app-ownership.test.ts`：独立 OS 进程争用、活跃持有者状态超时不抢占、实际退出释放；目录别名争用由 `review/app-handoff.test.ts` 验证；真实浏览器两个标签页验证控制权 |
| A09 / R08 | `test/app-core.test.ts`：操作准备后发送前暂停、在途暂停与迟到结果、恢复新观察；`test/app-process.test.ts`：暂停后进程重启；`review/app-handoff.test.ts`：正常退出先停止旧循环再交接 |
| A10 | `test/scenarios.test.ts`：验证挑战、限流、登录过期主动接管，全部为离线异常信号 |
| A11 / R09 | `test/safety.test.ts`、`review/network-guard.test.ts`：非本机网络阻断、真实适配器不可用、服务只监听 loopback；`test/app-core.test.ts`：Host/Origin/token/标签页控制校验 |
| A12 | `test/safety.test.ts`、`test/app-core.test.ts`：默认无提交；仅一次模拟授权，错误确认、计划变化、过期与复用阻断；一单模拟确认后禁止再次提交 |
| A13 / R10 | `test/journal-restart.test.ts`、`review/journal-integrity.test.ts`、`review/crash-boundary.test.ts`、`test/app-process.test.ts`：持久 intent/send/outcome 边界恢复、哈希链、计划绑定、脱敏、缺失/损坏证据关闭 |
| A14 | `test/bench.test.ts`、`review/benchmark-boundary.test.ts`：接受与终点时间边界；独立种子 1、预热 20、每策略 200 次，决策/状态字符串生成/模拟远端分别计时；不声称人工或真实官网优势 |
| R05 / R06 | `src/app/view.ts`、`web/render.js` 与 `review/app-handoff.test.ts`：步骤/理由/候选/最后有效观察/不明状态、重启历史标记、运行绑定目标不受未来编辑计划影响 |

运行 `npm.cmd test` 覆盖实现和独立评审测试。`node src/cli.ts rehearse --all --quiet` 覆盖 27 个声明场景。浏览器操作证据由 Codex 的 Computer Use 工具实际生成，保存在本地；它不是 Node 测试命令的一部分。Windows 已实测，其他系统未实机验收。没有 TypeScript 静态类型检查；Node 原生类型擦除与运行测试不能替代静态检查。
