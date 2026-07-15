# Masterpiece-OS

Masterpiece-OS v3.3 是一个 **Creative Brief Operating System**。它读取视觉素材，完成 Original Intent、Industry Benchmark、Creative Decision 与 Brand DNA Decision，再把完整 Analysis 压缩为任何设计师和 GPT 都能快速理解的 Creative Brief。

本版本的唯一目标是减少品牌与 GPT 之间的信息损失。Analysis 解释过去，Creative Brief 指导未来。

```text
Assets
→ Original Intent
→ Industry Benchmark
→ Creative Decision
→ Analysis
→ Creative Brief Compiler
→ Creative Brief
→ Design Review
```

## 环境

- Node.js 20 或更高版本
- 无第三方运行依赖，无需 `npm install`

## 快速开始

把素材放入 `projects/<项目名称>/input/`，填写项目根目录的 `masterpiece-os.json`：

```bash
npm run analyze -- --project "我的品牌"
```

项目缺少标准目录时，初始化器会安全创建 `input/` 与 `outputs/`，并在无冲突时把根目录素材移入 `input/`。

每次启动视觉分析都会自动读取 [`docs/Project Brief.md`](docs/Project%20Brief.md) 作为 Pipeline 执行契约，并据此启用默认 Standard 模式、全部图片核验、至少三个同品类联网 Benchmark、七阶段 Profiling 与正式输出规则，无需把该文件复制到项目目录。

如某个项目需要专属规则，可在项目根目录放置 `Project Brief.md` 或 `Project-Brief.md`；项目级文件优先于默认文档，并会被初始化器保留在根目录。也可以显式指定：

```bash
npm run analyze -- --project "我的品牌" --project-brief "D:/briefs/custom.md"
```

## 分析模式

### Quick

用于快速品牌验证，只生成一份正式文件：

```bash
npm run analyze -- --project "我的品牌" --mode quick
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

### Studio

用于正式品牌项目与深度行业研究；自动启用在线对标候选，正式输出仍为同样四份文件：

```bash
npm run analyze -- --project "我的品牌" --mode studio
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

每次运行都会在控制台显示七阶段耗时：Read Assets、Brand Understanding、Industry Benchmark、Creative Decision、Compiler Pipeline、Creative Brief 与 Review，以及 Total。

需要结构化调试数据时：

```bash
npm run analyze -- --project "我的品牌" --debug
```

这会生成 `outputs/debug/performance.json`。它是调试数据，不属于正式输出，也不会写入任何项目报告。旧 `--profile` 参数继续作为只写 Performance JSON 的兼容入口。

## GPT 协作边界

GPT 的输入是已核验视觉方案与运行时高密度 Brief。GPT 自主完成创意、图片规划和图片生成；Masterpiece 不生成图片数量、比例、任务卡、执行队列或 Prompt。

## 开发验证

```bash
npm test
npm run test:regression
```

更多说明见 [使用手册](docs/使用手册.md)、[架构说明](docs/架构说明.md)、[Creative Brief Review](docs/Creative-Brief-Review.md) 与 [项目自动初始化](docs/项目自动初始化.md)。
