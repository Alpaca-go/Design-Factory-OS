# Masterpiece-OS — GitHub 文件管理规范

## 核心边界

> GitHub = 系统；本地 = 项目；Thinking Framework = 通用思考问题；Creative Brief = 项目交接文件。

系统能力与项目数据必须永久分离。仓库只保存程序、文档、规则、模板、通用知识、测试脚本及明确脱敏或完全自制的 Demo。

## 可以提交

- `docs/`：系统文档
- `skills/`：Skill 定义
- `rules/`：通用规则
- `templates/`：空白模板
- `knowledge/thinking/`：不包含客户事实的通用设计思考问题
- `tests/`：测试脚本与脱敏夹具
- `examples/`：完全自制或已脱敏并明确标识的 Demo
- `projects/.gitkeep`：仅用于保留本地项目容器目录
- 系统源码、README、Roadmap、Changelog、License 与版本文件

## 禁止提交

- `Masterpiece-OS-Projects/` 或任何真实项目目录
- `projects/` 下除 `.gitkeep` 之外的任何真实项目内容
- `history/reviews/` 下的旧版 review.json、review.md 和项目成长数据
- PSD、AI、CDR、PDF、ZIP 等客户源文件
- 客户 Logo、包装刀版、Brief、合同与商业资料
- 最终 PNG/JPG 和其他生成结果
- 四份项目分析/评审报告、`review.json`、修改记录与客户交付文件

真实项目默认存放在仓库内的 `projects/`，该目录内容已由 `.gitignore` 排除；也可继续存放在仓库外的同级目录 `Masterpiece-OS-Projects/`。无论采用哪种方式，真实素材和交付物都不得进入 Git。

## Thinking Framework 准入规则

每个问题必须同时满足：

1. 能帮助设计师检验判断，而不是替设计师给出答案；
2. 能迁移到不同项目；
3. 不含客户名称、素材、业务数据或可识别信息。

## Codex 提交前检查

1. 执行 `npm test`，其中仓库政策测试会检查高风险文件。
2. 检查 `git status --short`，确认没有真实项目或输出目录。
3. 人工复核新增示例和 Thinking Framework 是否已脱敏。
4. 系统使用语义化版本；客户项目版本只保留在本地。
