---
name: masterpiece-os
description: 逐张核验品牌视觉素材，完成 Brand DNA Decision，并输出专业 Creative Brief。
---

# Masterpiece-OS v3.2

## 必须先做

1. 实际查看项目中的每张视觉图片。
2. 不得仅依据文件名、OCR、尺寸或元数据判断画面内容。
3. 识别品牌、行业、Logo、色彩、字体、版式、包装、核心资产、已有触点及当前优缺点。
4. 联网核验至少三个真正同类型、同定位的公开案例。
5. 把核验数量、画面事实和不能确认的信息写入 `masterpiece-os.json`。
6. `visualInspection.verified` 只能在全部图片完成核验后设为 `true`。
7. 按 Original Intent → Industry Benchmark → Creative Decision → Approved Brand DNA 完成决策；用户视觉方案不能直接成为 Brand DNA。
8. 只有 Creative Director 显式批准后，Approved Brand DNA 才能进入 Brief。

## 执行

```bash
npm run analyze -- --project "项目名称" --online
```

检查固定四份输出：

- `01-项目分析报告.md`
- `02-Creative-Brief.md`
- `03-Knowledge-Review.md`
- `04-Design-Review.md`

Creative Brief 必须完整覆盖十部分，面向专业品牌设计师或创意团队。它不是 Prompt，不得包含图片数量、画幅、任务卡、执行队列或对 AI 的操作命令。

交接给 GPT 时只提供已核验视觉方案与 `02-Creative-Brief.md`，由 GPT 自主完成图片规划和生成。

Knowledge 保存思考问题而不是项目答案。任何“待确认”内容都必须继续保持待确认，不得使用其他品牌或通用案例补写。本工作流不生成图片、不改正式系统知识，也不执行 Git Commit/Push。
