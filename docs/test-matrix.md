# 需求与验证对应表

C-002 已独立验收；C-004 有限只读范围已获实际 Claude 同意；C-003 的最新额度接手修复待实际复审。购买测试使用虚构页面/端口；公开预检使用结构用例和网络替身，另有实际公开 GET/浏览器观察。这些均不证明 Apple 结账或自提时段机制。

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
| R02 局部 / A04 / A10 / A11 / A13 | `review/public-entry.test.ts`：13 项公开入口识别、未加载/过期/未知/读取失败分离、固定 GET 范围与重定向/认证/拒绝/限流停止、来源声明、额外敏感字段拒绝、原演练网络拦截保留；CLI 导入测试用独立进程的禁网预加载器；实际只读入口证据见 `docs/reviews/C-004.md`。真实计划/会话/商品门店绑定与 U02–U06 未验证 |

运行 `npm.cmd test` 覆盖实现和独立评审测试。`node src/cli.ts rehearse --all --quiet` 覆盖 28 个声明场景。浏览器操作证据由 Codex 的 Computer Use 工具实际生成，保存在本地；它不是 Node 测试命令的一部分。Windows 已实测，其他系统未实机验收。没有 TypeScript 静态类型检查；Node 原生类型擦除与运行测试不能替代静态检查。

新增独立复现：`review/rollback-evidence.test.ts` 验证部分回滚不产生第二单、提示准确；`review/public-entry-cross-review.test.ts` 验证隐藏内容、类型及源码隔离；`review/journal-io-cross-review.test.ts` 用真实目录读取错误验证新旧日志的状态／启动／恢复／授权、重开释放、未来计划提示。四个 I/O／提示用例修复前 0/4，修复后 4/4，16 个受保护文件未改。

`test/app-evidence.test.ts` 覆盖孤儿证据、发送前异常和物理路径门禁；`test/public-entry-hidden.test.ts` 补充隐藏结构；新 `test/journal-io-boundaries.test.ts` 有六个额度接手实现用例，验证发送前读错、初始化／重放异常、未知证据、所有权历史／退出写入错误的锁释放。这六项是 Codex 实现检查，仍待 Claude 独立审查。

当前完整回归：**167 项通过、0 失败/跳过/取消**，28 场景预期全部一致、外部访问 0。源码身份为 C-005 的 58 文件清单；R3 56 文件／154 测试、R2 53 文件／144 测试和此前 48／44 文件保留为历史收据。通过测试不能代替双方一致，详见 `docs/reviews/C-005-codex-takeover.md`。

`review/last-slot-policy.test.ts` 是改动前冻结的 12 项标准，原版 4 通过／8 失败，补齐规则后 12 项通过；验证完整列表末档、不可选／拒绝／到店范围不回退到当天早档、发送前新增晚档、非法策略、日期范围、哈希冻结、超时和重启核实。原 16 个保护文件及新标准文件共 17 个未改。`last-slot-three-dates` 实际 CLI 从虚构 JSON 计划跑到两次明确拒绝、两次最新列表重选、第三天末档接受及零提交终点；真实相对日期绑定仍未验证，当前没有 C-005 浏览器验收声称。
