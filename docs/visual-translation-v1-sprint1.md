# Visual Translation V1 Sprint 1 交付记录

## 范围

本 Sprint 只实现以下闭环：

```text
00 Document Preparation
01 Visual Evidence Extraction
02 Visual Strategy Signal Map + 03 Visual Opportunity Mapping
04 Three Creative Directions
05 Local Direction Recommendation
10 Local Directions Report Compiler
```

Anchor Direction System、图片任务、Prompt Compiler 和 Visual Consistency Check 不在本轮范围。

## 去重复用

从 Brand DNA V3 设计中只抽取通用底层能力：

- OpenAI-compatible 纯文本 Reasoner；
- Document Set、Source Registry、Chunk、Hash 和去重；
- 通用结构化响应解析与字段契约；
- Checkpoint Hash、版本匹配与 Resume；
- 本地 Markdown Compiler、Usage、超时、取消和密钥脱敏。

未迁移 Brand Creative Decision、七类 Brand Genes、V3 Core Quality Gate、Creative Thesis、Visual System Task Plan、Compiled Image Tasks、Final Audit 或 Full Report。

## 当前版本

- Protocol：`visual-translation-v1`
- Checkpoint：`visual-translation-v1-checkpoint-1`
- Evidence Prompt：`visual-evidence-prompt-v1.0`
- Signal + Opportunity Prompt：`visual-signal-opportunity-prompt-v1.0`
- Directions Prompt：`visual-directions-prompt-v1.0`
- Directions Report：`visual-directions-report-v1`

## 正常调用数

短文档路径为 3 次模型调用：Evidence、Signal + Opportunity、Three Directions。Recommendation 和 Report Compiler 为本地阶段。

## 质量规则

- 五类视觉信号必须齐全，总数 7–12 条，每类 1–3 条；
- 行业模板风险至少 2 条；
- 必须恰好生成 3 个方向；
- 任意两方向至少有 3 个显著差异维度；
- 方向评分只用于横向排序，最终选择必须由人工确认；
- 主报告视觉内容占比不得低于 65%；
- Checkpoint 必须同时匹配文档、上游、Prompt、Schema 和输出 Hash。

## 离线回归

九州美学离线 Fixture 生成三个方向：`安心轨迹`、`共生容器`、`责任刻度`。当前本地推荐为 `安心轨迹`，但 `humanSelectionRequired=true`。

Fixture 使用模拟模型，正常调用 3 次；模拟 Usage 为输入 360、输出 240 Token。该数据只验证运行记录，不代表真实 Provider 成本或耗时。真实 Qwen 数据需另行授权测试。

## 发布检查门

```powershell
npm run verify:document-flows
```

检查门完全离线，覆盖核心 Schema、三方向差异、Checkpoint Resume、报告占比、PDF/DOCX/Markdown/TXT 解析和 Desktop TypeScript 契约。

## 已知边界

- Sprint 1 提供核心程序入口和 Desktop 文档解析能力；Desktop 的产品入口与交互路由应在人工评估三方向报告后接入。
- 扫描型 PDF 仍需 OCR 或视觉输入能力。
- 尚未运行真实 Provider A/B，因此不声明真实 Token、延迟、成本或一次通过率。

## Desktop 测试入口

Sprint 1 后续已补充独立的 Desktop“视觉转译 V1”工作台。入口与现有 v5 图像分析隔离，支持：

- PDF、DOCX、Markdown、TXT 多文档选择与解析预览；
- 使用现有 API Profile 执行三次 OpenAI-compatible 文本模型调用；
- 六阶段进度、主动取消、失败记录与 Checkpoint Resume；
- 三方向报告查看、复制、Markdown 导出和输出文件夹定位；
- 本地保存输入副本、语料、Checkpoint、结构化输出、运行指标与最终报告。

运行开发客户端：`npm run desktop:dev`。生成 Portable EXE：`npm run desktop:package`。
