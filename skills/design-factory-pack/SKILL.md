---
name: design-factory-pack
description: 盘点品牌项目素材，生成四份正式报告，并运行 Design Review & Growth Engine。
---

# Design Factory Pack

在仓库根目录运行：

```bash
npm run analyze -- --project "项目名称"
```

项目应位于 `projects/<项目名称>/`。命令会先安全创建 `input/` 与 `outputs/`，把项目根目录中的素材整理进 `input/`；存在同名冲突时必须停止，禁止覆盖。只有一个项目时可以省略 `--project`。如用户明确要求实时对标案例，添加 `--online`；只有调试时添加 `--debug`。

必须检查四份正式输出：`01-项目分析报告.md`、`02-Chat生图任务包.md`、`03-Knowledge-Review.md`、`04-Design-Review.md`。Design Review 的评分必须有依据，问题必须有影响与建议，Strengths 至少 3 条，Improvement 至少 5 条。首次项目应明确暂无历史，后续项目应读取 `history/reviews/` 输出趋势。不得把启发式识别结果描述为最终品牌规范，也不得自动修改 Knowledge、Rule、Prompt、Template 或执行 Git Commit/Push。
