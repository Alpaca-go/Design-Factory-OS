# Brand DNA v3 Sprint 1 交付记录

## 范围

- 本地 Document Preparation、Source Registry、内容 Hash、去重语义分段和项目任务词清洗。
- 单次/有限并发 Evidence Map，关闭思考。
- 单次 Brand Creative Decision，合并战略重建、批判诊断、七类 DNA 和唯一创意命题。
- 本地 Core Quality Gate、受限 JSON Patch 和核心报告编译。
- 带文档、上游、Prompt、Schema 和输出 Hash 的阶段 Checkpoint。
- 模型调用 Usage、思考开关、完成原因和阶段耗时记录。

## 新旧流程

旧核心流程需要 Evidence、Facts、Strategy、Critic、DNA、Thesis 等多次串行调用。v3 短文档核心流程为：

```text
Document Preparation（本地）
→ Evidence Map（1 次）
→ Brand Creative Decision（1 次）
→ Core Quality Gate（本地；必要时最多 1 次受限 Patch）
→ Core Report（本地）
```

## 版本

- Protocol：`brand-dna-v3-deep-compact`
- Evidence Prompt：`evidence-map-prompt-v3.1`
- Decision Prompt：`brand-creative-decision-prompt-v3.1`
- Core Report：`brand-dna-core-report-v3`
- Checkpoint：`brand-dna-v3-checkpoint-1`

## Checkpoint

每个记录包含 `documentSetHash`、`upstreamHash`、Protocol/Prompt/Schema 版本、Provider/Model、思考开关、输出文件、输出 Hash、Usage IDs 和完成时间。只有所有版本、Hash 和校验状态匹配时才复用。

## 测试与性能

- 离线 v3 核心测试覆盖：2 次调用、唯一创意命题、原文件名、零调用 Resume、Patch 越界拒绝。
- 短文档核心正常路径：2 次模型调用，相比旧核心路径减少超过 60%。
- 未执行真实 Qwen，因此暂不填写真实 Token、费用和分钟数，也不宣称达到性能验收线。

## 已知限制

- Sprint 1 尚未接入 Desktop 灰度开关。
- 视觉系统、Prompt 和最终独立审计属于 Sprint 2/3。
- 真实 qwen3-vl-plus / qwen3.6-plus A/B 按要求留待用户授权的测试矩阵。

## 回滚

Desktop 继续使用 `v2-reliable`。删除或关闭 v3 路由即可回滚；v3 不覆盖 v2 Checkpoint 和报告。

## 合并建议

建议保留在功能分支继续开发，不建议在 Sprint 3 和真实验收前设为 Desktop 默认流程。
