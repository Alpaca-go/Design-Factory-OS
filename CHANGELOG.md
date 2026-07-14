# Changelog

## 3.2.0 — 2026-07-14

- 新增独立 Brand DNA Decision 契约，强制执行 Original Intent → Industry Benchmark → Creative Decision → Approved Brand DNA。
- 只有决策链完整且显式批准时，九个 Approved Brand DNA 维度才会进入 Creative Brief。
- 旧 `creativeReasoning.visualDNA` 仅保留为迁移候选，阻止用户视觉方案被静默升级为品牌结论。
- Creative Brief 第五部分由 Visual DNA 改为 Approved Brand DNA；Design Review 同步检查决策链与批准状态。
- 明确 GPT Collaboration：输入为已核验视觉方案与 Creative Brief，GPT 自主完成图片规划和生成。
- 保持四份固定 Markdown，不恢复 PKG、VI、Poster、图片数量、画幅、任务卡或 Prompt 规划。
- Thinking Framework 的视觉问题改为检查决策追溯与 Approved Brand DNA，不保存项目答案。
- 增加三类决策防绕过测试，并迁移三个匿名回归样例到 v3.2。
- 在架构说明中定义真实项目 A/B 验证口径：总耗时、首图质量、满意度、返工和品牌一致性。

## 3.1.0 — 2026-07-14

- 将产品重新定位为 AI Creative Brief Generator：系统理解品牌，专业创意团队负责设计。
- 核心流程调整为 Visuals → Brand Lock → Benchmark → Creative Reasoning → Creative Brief。
- Creative Reasoning 升级为 Brand Identity、Brand Positioning、Design Language、Emotional Direction、Visual DNA、Photography Direction、Design Risks、Must Keep、Can Explore 与 Design Goal 十部分契约。
- `02-Creative-Brief.md` 替代 `02-Chat生图任务包.md`；每次固定生成四份编号报告。
- 删除流水线内部缺图矩阵、图片数量、画幅比例、任务卡与 Chat 生图执行计划。
- Knowledge 重构为 `knowledge/thinking/` 下的五类开放思考问题，不再把项目结论升级为答案或自动规则。
- Design Review 改为 Creative Brief 证据与准备度检查；停止能力评分和成长历史写入。
- 保留旧模式参数兼容映射，但所有入口统一执行 Creative Brief 工作流。
- CLI、模板、Skill、规则、文档和回归测试全部更新到 v3.1。

## 3.0.0 — 2026-07-14

- 新增 Creative Reasoning，在图片规划前输出品牌定位、关键词、气质、视觉 DNA、摄影语言与创意方向。
- 新增 Design Risks，以问题、原因、避免方式替代默认完整 Design Critic 链路。
- Chat 生图任务包重构为“品牌设计意图 + 图片任务”，任务卡默认继承上层约束。
- 新增 `visualInspection` 契约；未完成逐张视觉核验时明确标记待确认，不以文件名、OCR、尺寸或元数据伪造画面事实。
- 默认启用 Fast Mode，只生成项目分析报告和 Chat 生图任务包。
- 新增 `--mode review`、`--mode research`、`--review` 与 `--research`；完整评审仍保持四份既有文件名。
- Fast Mode 跳过 Knowledge、Design Review 与历史写入；所有模式均禁止自动修改正式 Knowledge 或执行 Git 操作。

## 2.0.0 — 2026-07-14

- 新增 Design Review & Growth Engine，以带依据的成长评审替代无依据的主观打分。
- 新增 Brand、Packaging、Visual System、Portfolio 与 Benchmark 专项评审。
- 新增八维能力雷达、七项跨项目趋势、下一阶段建议和 Top 3 训练路线。
- 新增六类 Action Items，所有 Knowledge、Rule、Prompt、Template 修改仍需人工执行。
- 新增 `history/reviews/` 本地 JSON/Markdown 历史记录，真实记录默认不进入 Git。
- 正式输出收敛为四份编号报告；`--debug` 时额外生成结构化 JSON。
- 增加首次项目、第二项目趋势、评分依据、建议完整性及历史记录回归测试。

## 1.2.0 — 2026-07-14

- 新增仓库内 `projects/` 标准工作目录及 `.gitkeep`。
- 新增 `--project` 项目选择、单项目自动选择和多项目防误选。
- 分析启动前自动创建 `input/`、`outputs/` 并移动根目录素材。
- 初始化支持嵌套目录、旧版 `inputs/` 迁移、幂等运行与全量冲突预检。
- 增加路径穿越、符号链接越界、覆盖和部分移动失败保护。
- Git 只跟踪 `projects/.gitkeep`，真实项目、源文件和生成报告保持忽略。

## 1.1.0 — 2026-07-14

- 新增 Knowledge Candidate 数据契约与候选报告。
- 新增 Knowledge Analysis，对候选执行 New、Update、Ignore、Project Only 分类。
- 新增 Packaging、Brand、VI、Poster、Portfolio 知识库健康度分析。
- 新增 P0–P3 优先级和人工审核清单。
- Approved Rule 目录保持只读，支持 JSON 与带 Frontmatter 的 Markdown。
- 默认项目输出目录调整为 `outputs/`，每次运行保证生成三个规范文件。

## 1.0.1 — 2026-07-14

- 将带有真实项目名称的测试素材替换为三个明确匿名的自制 Demo。
- 纳入 GitHub 文件管理规范并扩充项目文件忽略规则。
- 增加仓库政策自动检查，阻止客户源文件与项目交付物误提交。

## 1.0.0 — 2026-07-14

- 初始化 Masterpiece-OS 仓库与目录结构。
- 新增零依赖 `masterpiece-os` CLI。
- 新增 ZIP、PDF、PPTX、PNG/JPEG/GIF/WebP/SVG 素材盘点。
- 新增 Brand Lock、行业/项目类型识别、可选联网对标。
- 新增视觉优化报告、缺图矩阵、13 张图片规划与 Chat 生图任务包。
- 新增三套回归项目及自动测试。
