# Masterpiece OS — 项目长期记忆

## 实验分支 / v2 视觉方向
- 当前工作分支：`experiment/execution-oriented-directions-v2`（基于 v1.3.3 提交 `b404c76`）。
- 桌面端默认走 **V1（conceptual_v1）**；v2（execution_oriented_v2）需用户在 UI「方向生成模式」手动开启。
- v2 协议名是 `visual-translation-v2-execution`，**不是** v2.1；v2.1 仅为一次「专项修复」升级（见 2026-07-21 日志），协议名维持 v2。

## v2.1 fixtures 约定（重要）
- `tests/fixtures/visual-direction-v2/jiuzhou-meixue/v2-directions.json` = **v2.1 好集合**（3 方向 A/B/C 真实差异，整体现 ready/allowed）。它是「九州美学新报告」交付物的输入，不要改回同质集合。
- `v2-directions-homogeneous.json` = v2.1 合法但**同质退化**的负面回归用例。**不是** git 原始 fixture（原始缺 compliance_weights 等字段，已不合法）。由 `scripts/gen-negative-jzmx-fixture.mjs` 生成。
- 三项目（jiuzhou-meixue / mingjitang / vanke-suwan）A/B 快照在 `tests/snapshots/visual-direction-v2/`，改 fixture 后必须 `node scripts/regen-v2-snapshots.mjs` 再生。
- 报告交付物在 `docs/v2.1-deliverables/`（`gen-jzmx-reports.mjs` 生成）。

## 测试 / 门禁
- 改 report compiler 等文档流代码后必须跑 `npm run verify:document-flows`（离线，不调真实模型 API）。
- v2 专项测试只存在于 `tests/v5/visual-translation-v2*.test.js` 三个文件；其余测试不 import v2 模块。
