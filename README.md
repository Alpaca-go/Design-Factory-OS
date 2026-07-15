# Masterpiece-OS

Masterpiece-OS v5.0 是一个 **AI Creative Director Preparation System**。v5 使用一次完整 Deep Creative Director 推理，把全部视觉素材、品牌事实与 Benchmark 组织成唯一正式输出《视觉方案升级报告.md》。

当前分支为 v5.0 alpha。v4.0 Pipeline 与历史输出能力仍被完整保留，可通过显式 v4 命令运行。

```text
Assets
→ Asset Intake
→ One Deep Creative Director Session
→ 视觉方案升级报告.md
→ .runtime/run-report.json
```

## 环境

- Node.js 20 或更高版本
- 无第三方运行依赖，无需 `npm install`

## 快速开始

把素材放入 `projects/<项目名称>/input/`，填写项目根目录的 `masterpiece-os-v5.json`：

```bash
npm run analyze -- --project "我的品牌"
```

项目缺少标准目录时，初始化器会安全创建 `input/` 与 `outputs/`，并在无冲突时把根目录素材移入 `input/`。

v5 不再接受 Quick / Standard / Studio 模式，也不计算 Creative Freedom 百分比。默认行为固定为 Deep Mode、Maximum Creative Authority、Logo Locked 和单文档输出。

项目配置模板见 `templates/masterpiece-os-v5.json`。宿主可注入单一 `deepCreativeDirectorReasoner`，或从配置读取一份已完成的 `deepCreativeDirectorResult`。Sprint 2 已接入完整 Prompt；Sprint 2.1 增加批量视觉准备、Benchmark 缓存、精确结果缓存和真实端到端计时。

v5 默认只声明一份正式输出：

```text
视觉方案升级报告.md
```

性能与会话边界记录保存在 `.runtime/run-report.json`，不属于正式输出。

## v5 Deep Creative Director Prompt

Sprint 2 将一次完整推理所需内容拆分为可维护模板，并在运行时合并成一个模型请求：

```text
System Prompt
+ Project Input
+ Asset Manifest / Attachments
+ Explicit Constraints
+ Category & Creative Excellence Benchmark
+ GPT Execution Core
+ Fixed Report Schema
→ One Deep Creative Director Call
→ 视觉方案升级报告.md
```

模板位于 `prompts/v5/`。拆分仅用于维护，不会产生第二次总结、压缩、评审或 Compiler 调用。报告使用固定 0–10 章节，资产决策值只允许“保留、升级、替换、删除、新增”。

## v5 性能预算

默认目标为 10 分钟，可接受上限为 15 分钟。超过 5 张图片时，运行时会在 `.runtime/cache/` 生成一张 Contact Sheet，并只附加最多 5 张优先细节图；Logo 素材优先。完整资产索引仍进入 Prompt，资产决策不得遗漏未单独附加的图片。

视觉准备与行业 Benchmark 按素材指纹和行业缓存。完全相同的 Prompt 可以复用上一份完整推理结果，此时 `modelCallsThisRun` 为 0；使用宿主选项 `forceReasoning` 可强制重新推理。报告默认预算为 8,000 字符。

`.runtime/run-report.json` 会分别记录视觉准备、Contact Sheet、Benchmark、Prompt 构建、实际模型等待、输出写入和端到端墙钟时间。`timingScope` 明确计时边界；失败和 15 分钟超限也会写入运行记录。

## v4.0 兼容入口

历史项目继续使用原有 `masterpiece-os.json`、模式、Active State、五个 Compiler 和四文件输出：

```bash
npm run analyze:v4 -- --project "我的品牌" --mode standard
```

## 分析模式

### Quick

用于快速品牌验证，只生成一份正式文件：

```bash
    npm run analyze:v4 -- --project "我的品牌" --mode quick
```

```text
02-Creative-Brief.md
```

### Standard（默认）

生成四份标准交付：

```text
01-Analysis.md
02-Creative-Brief.md
03-Design-Decisions.md
04-Design-Review.md
```

当 Project Brief 包含 Validation Report 契约时，Pipeline 还会自动生成项目级验证记录：

```text
Masterpiece OS v4.0 Validation Report — <项目名称>.md
```

该文件记录 Creative Freedom、三态分类、正式输出完成时间与完整交付时间，但不计入四份正式输出契约。

### Studio

用于正式品牌项目与深度行业研究；自动启用在线对标候选，正式输出仍为同样四份文件：

```bash
    npm run analyze:v4 -- --project "我的品牌" --mode studio
```

## 四类信息职责

- `01-Analysis.md`：Original Intent、Industry Benchmark、Competitor Analysis、Evidence、Reasoning、Creative Decision 与完整 Design Risks。
- `02-Creative-Brief.md`：只保存最终设计方向，不包含研究、证据或推理过程。
- `03-Design-Decisions.md`：保存关键决策、原因、主动取舍、批准 DNA 和设计边界。
- `04-Design-Review.md`：检查八部分 Brief 是否完整，以及 Analysis 与 Brief 是否真正分离。

Quick 是正式例外，只保留 `02-Creative-Brief.md`。

## Creative Brief 的八部分

1. Creative Vision
2. Brand Personality
3. Approved Brand DNA
4. Creative Principles（含简洁 Avoid Rules）
5. Must Keep
6. Can Explore
7. Photography Direction
8. Design Goal

Creative Brief 禁止包含 Industry Benchmark、Competitor、Evidence、Reasoning、判断依据或推导过程。每句话都必须帮助设计。

## Creative Brief Compiler

Compiler 是信息压缩层，不是新的 AI 推理引擎。它只从 Analysis 选择、压缩和重组已批准信息：

```text
Analysis → Information Compression → Creative Brief
```

它不会重新判断品牌，不会修改 Approved Brand DNA，也不会用对标案例替代项目事实。面向 GPT 的 1000–1500 字高密度 Brief 只在运行时内存中生成，不保存为第五个正式文件。

## 逐张视觉核验

文件名、OCR、尺寸和元数据不能替代画面判断。查看全部图片后，在配置中记录：

```json
{
  "visualInspection": {
    "verified": true,
    "inspectedImageCount": 2,
    "inspectedImages": ["01.png", "02.png"],
    "findings": ["主视觉使用非对称网格", "产品摄影保留真实接触阴影"]
  }
}
```

核验数量未覆盖全部图片时，系统继续保留待确认状态。

## Brand DNA Decision

Approved Brand DNA 必须完整经过：

```text
Original Intent
→ Industry Benchmark
→ Creative Decision
→ 九个 DNA 维度
→ 显式批准
```

旧 `creativeReasoning.visualDNA` 只作为迁移候选，绝不会自动升级为批准结论。完整配置见 `templates/masterpiece-os.json`。

## Performance Profiling

显式 v4 运行会在控制台显示原有阶段耗时。v5 将资产读取、唯一 Creative Director Session、输出和总耗时写入 `.runtime/run-report.json`。

需要结构化调试数据时：

```bash
npm run analyze -- --project "我的品牌" --debug
```

这会生成 `outputs/debug/performance.json`。它是调试数据，不属于正式输出。旧 `--profile` 参数继续作为只写 Performance JSON 的兼容入口。

日常项目 Validation 不需要运行完整开发测试。四份输出和 Validation Report 生成后，可执行毫秒级交付检查：

```bash
npm run validate -- --project "我的品牌"
```

该命令只检查 Active State、Digest、四份正式输出、Validation Report、Design Review 和 Runtime GPT Brief 边界。`npm test` 保留给代码、Prompt 或 Architecture 发生变化时的开发回归。

## GPT 协作边界

GPT 的输入是已核验视觉方案与运行时高密度 Brief。GPT 自主完成创意、图片规划和图片生成；Masterpiece 不生成图片数量、比例、任务卡、执行队列或 Prompt。

## 开发验证

```bash
npm test
npm run test:v5
npm run test:regression
```

更多说明见 [使用手册](docs/使用手册.md)、[架构说明](docs/架构说明.md)、[Creative Brief Review](docs/Creative-Brief-Review.md) 与 [项目自动初始化](docs/项目自动初始化.md)。
