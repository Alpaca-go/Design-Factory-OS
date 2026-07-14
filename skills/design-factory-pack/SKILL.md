---
name: design-factory-pack
description: 盘点品牌项目素材并生成 Brand Lock、视觉优化报告、缺图分析、图片规划和 Chat 生图任务包。
---

# Design Factory Pack

在仓库根目录运行：

```bash
node bin/design-factory.js analyze <项目素材目录> --output <输出目录>
```

如用户明确要求实时对标案例，添加 `--online`。生成后必须先检查 `01-Brand-Lock.md` 的待确认项，再检查 `Knowledge-Analysis.md`，最后交付 `Chat生图任务包.md`。不得把启发式识别结果描述为最终品牌规范，也不得由流水线修改 `knowledge/approved/`。
