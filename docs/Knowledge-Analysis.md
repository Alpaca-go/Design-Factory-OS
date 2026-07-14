# Knowledge Analysis 开发与审核说明

Knowledge Analysis 是 Knowledge Engine 的配套模块。它不生成正式知识，不修改知识库，只分析本次候选对 Approved Rule 的影响。

## 数据流

```text
项目分析
  → Chat生图任务包.md
  → Knowledge-Candidate.md
  → Knowledge Analysis
  → Knowledge-Analysis.md
  → 人工审核
```

## 建议动作

- `New`：没有足够相似的 Approved Rule。
- `Update`：候选明确指向 Rule，或与同类 Rule 部分重合。
- `Ignore`：与已有 Rule 高度重复。
- `Project Only`：包含客户品牌色、项目名称、单项目选择或专属视觉偏好。

文本相似度只用于缩小人工审核范围，不代表设计结论。明确的 `targetRule` 优先于相似度判断。

## 知识库健康度

固定检查 Packaging、Brand、VI、Poster、Portfolio。分类中至少存在一条 Approved Rule 时标记“稳定”，否则标记“建议补充”；待审核候选数量会写入判断依据。

## 安全约束

- 不写入或删除 `knowledge/approved/`。
- 不自动批准 Candidate。
- 不自动升级 L1/L2/L3。
- 任何正式知识变更必须由人工审核后另行执行。
