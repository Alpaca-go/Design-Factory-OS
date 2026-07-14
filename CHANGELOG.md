# Changelog

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

- 初始化 Design Factory OS 仓库与目录结构。
- 新增零依赖 `design-factory` CLI。
- 新增 ZIP、PDF、PPTX、PNG/JPEG/GIF/WebP/SVG 素材盘点。
- 新增 Brand Lock、行业/项目类型识别、可选联网对标。
- 新增视觉优化报告、缺图矩阵、13 张图片规划与 Chat 生图任务包。
- 新增三套回归项目及自动测试。
