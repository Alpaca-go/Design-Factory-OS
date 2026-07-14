# Design Factory OS — GitHub 文件管理规范

## 核心边界

> GitHub = 系统；本地 = 项目；Knowledge = 通用经验；Review = 项目记录；Chat 生图任务包 = 项目交接文件。

系统能力与项目数据必须永久分离。仓库只保存程序、文档、规则、模板、通用知识、测试脚本及明确脱敏或完全自制的 Demo。

## 可以提交

- `docs/`：系统文档
- `skills/`：Skill 定义
- `rules/`：通用规则
- `templates/`：空白模板
- `prompt-library/`：通用 Prompt 模板
- `knowledge/`：至少经过两个项目验证、可迁移且不包含客户信息的经验
- `tests/`：测试脚本与脱敏夹具
- `examples/`：完全自制或已脱敏并明确标识的 Demo
- `projects/.gitkeep`：仅用于保留本地项目容器目录
- `history/reviews/.gitkeep`：仅用于保留本地成长记录目录
- 系统源码、README、Roadmap、Changelog、License 与版本文件

## 禁止提交

- `Design-Factory-Projects/` 或任何真实项目目录
- `projects/` 下除 `.gitkeep` 之外的任何真实项目内容
- `history/reviews/` 下除 `.gitkeep` 之外的 review.json、review.md 和项目成长数据
- PSD、AI、CDR、PDF、ZIP 等客户源文件
- 客户 Logo、包装刀版、Brief、合同与商业资料
- 最终 PNG/JPG 和其他生成结果
- 四份项目分析/评审报告、`review.json`、修改记录与客户交付文件

真实项目默认存放在仓库内的 `projects/`，该目录内容已由 `.gitignore` 排除；也可继续存放在仓库外的同级目录 `Design-Factory-Projects/`。无论采用哪种方式，真实素材和交付物都不得进入 Git。

## Knowledge 准入规则

每条 Knowledge 必须同时满足：

1. 至少经过两个真实项目验证；
2. 能迁移到其他项目；
3. 不含客户名称、素材、业务数据或可识别信息。

## Codex 提交前检查

1. 执行 `npm test`，其中仓库政策测试会检查高风险文件。
2. 检查 `git status --short`，确认没有真实项目或输出目录。
3. 人工复核新增图片和 Knowledge 是否已脱敏。
4. 系统使用语义化版本；客户项目版本只保留在本地。
