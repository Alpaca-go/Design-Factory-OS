# Masterpiece-OS v3.3 架构说明

v3.3 将系统从分析脚本集合升级为可替换、可测量的 Creative Pipeline。最高原则是减少品牌与 GPT 之间的信息损失。

## Pipeline

Pipeline 启动前先由 `project-brief` 解析执行契约。解析优先级为：`--project-brief` 显式路径 → 项目根目录 `Project Brief.md` / `Project-Brief.md` → `docs/Project Brief.md`。契约决定默认模式、联网同品类 Benchmark、最少案例数、逐图核验和正式输出要求，但不会作为视觉素材进入 inventory。

```text
Assets
→ Read Assets
→ Original Intent
→ Industry Benchmark
→ Creative Decision
→ Analysis
→ Creative Brief Compiler
→ Creative Brief
→ Design Review
```

每个阶段具有单一职责、明确输入输出和独立耗时。

## 模块职责

1. `inventory` / `project-initializer`：安全整理并读取素材。
2. `brand-dna-decision`：建立 Original Intent、Industry Benchmark、Creative Decision 与 Approved Brand DNA。
3. `creative-reasoning`：在 Analysis 层保存品牌身份、定位、设计语言、情绪、摄影与风险。
4. `analysis`：汇总完整证据、研究、推理、决策和 Design Risks。
5. `creative-brief-compiler`：只压缩并重组 Analysis，不新增推理或更改决策。
6. `design-decisions`：记录关键设计决策、原因、取舍和批准状态。
7. `brief-review`：检查八部分 Brief 与 Analysis 分离状态。
8. `report`：执行 Quick 或 Standard/Studio 输出策略，阻止第五个正式文件。
9. `pipeline`：协调七阶段并记录性能。

## Analysis 与 Brief

Analysis 保存 Original Intent、Industry Benchmark、Competitor Analysis、Evidence、Reasoning、Creative Decision 与完整 Design Risks。

Creative Brief 只保存 Creative Vision、Brand Personality、Approved Brand DNA、Creative Principles、Must Keep、Can Explore、Photography Direction 与 Design Goal。完整风险在 Analysis；Brief 仅保留简洁 Avoid Rules。

## 模式与输出

- Quick：只生成 `02-Creative-Brief.md`。
- Standard：生成 `01-Analysis.md`、`02-Creative-Brief.md`、`03-Design-Decisions.md`、`04-Design-Review.md`。
- Studio：使用更深对标检索，正式输出与 Standard 相同。

GPT Brief 只存在于运行时内存。`--debug` 的 `outputs/debug/performance.json` 与结构化结果均为调试数据，不属于正式输出；`--profile` 保留为 Performance JSON 兼容入口。

## 性能契约

固定记录：`readAssets`、`brandUnderstanding`、`industryBenchmark`、`creativeDecision`、`compilerPipeline`、`creativeBrief`、`review` 与 `total`，单位为秒，并记录可用的 decisionId、模型/Provider、图片数、token、网络请求、缓存、重试和 Schema 失败上下文。默认只在控制台显示；项目交付文档不得包含性能数据。

## 写入边界

- 不自动修改 Knowledge、规则或模板。
- 不生成图片规划、Prompt、数量或比例方案。
- 不把对标结论写成本项目事实。
- 不把用户视觉直接升级为 Approved Brand DNA。
- 不创建永久 `Creative-Brief-GPT.md`。
