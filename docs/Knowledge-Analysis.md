# Knowledge Analysis（历史架构说明）

Knowledge Candidate、Approved Rule 健康度与自动分类属于 v1.1 历史架构，已不在 v3.2 默认流水线中运行。

当前 Knowledge 已重构为只读 `knowledge/thinking/`：保存优秀设计师会提出的开放问题，不保存项目答案、不生成自动规则，也不把单个项目结论写回系统知识。

当前数据流：

```text
Thinking Framework Questions
→ 03-Knowledge-Review.md
→ GPT / Designer 实时推理
```

此文件仅解释旧名，避免维护者误以为 Knowledge Analysis 仍是当前产品能力。现行约束以 `docs/架构说明.md` 为准。
