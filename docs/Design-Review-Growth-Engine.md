# Design Review & Growth Engine

## 定位

引擎是 AI 设计导师，不是脱离证据的审美打分器。自动评分用于建立可比较的成长基线：每项评分包含理由，每个问题包含影响与可执行建议，无法可靠判断的视觉细节会明确标记为证据不足。

## 正式输出

```text
outputs/
├─ 01-项目分析报告.md
├─ 02-Chat生图任务包.md
├─ 03-Knowledge-Review.md
└─ 04-Design-Review.md
```

`--debug` 模式额外输出 `design-factory-result.json`。正式运行会清理已知旧版报告文件，避免新旧报告并存造成误用。

## 评审结构

- 总体评分、一句话总结和项目完成度
- Brand Review：识别度、Logo、统一性、记忆点
- Packaging Review：Hero、结构、材质、工艺、摄影、产品展示
- Visual System Review：色彩、字体、图形、留白、网格、信息层级
- Portfolio Review 与 0–100% 完整度
- Benchmark Review：共性、差距、最值得学习的三点及原因
- P0/P1/P2、至少三条 Strengths、至少五条 Improvement

能力雷达固定为八维：品牌识别、包装设计、版式、字体、色彩、摄影、VI、作品集表现。人工评分可通过 `design-factory.json` 的 `reviewScores` 覆盖。

## 成长历史

本地历史保存在 `history/reviews/`：

```text
YYYY-MM-DD-项目名称.review.json
YYYY-MM-DD-项目名称.review.md
```

JSON 保存总体评分、模块评分、能力雷达、成长建议和 Action Items。首次项目不计算趋势；第二个项目开始对比品牌识别、包装设计、字体、版式、摄影、VI、作品集表现，并输出 ↑、→、↓。

同一项目同一天重复运行会覆盖同一记录，不会把当前记录重复计入历史均值。无法解析的历史文件会记录警告，不阻塞本次评审。

## 自动化边界

Action Items 只说明是否值得人工修改当前项目、Prompt、Knowledge、Rule 或 Template。引擎不会自动修改这些系统资产，也不会自动执行 Git Commit 或 Git Push。真实历史记录已由 `.gitignore` 排除，仓库只保留 `history/reviews/.gitkeep`。
