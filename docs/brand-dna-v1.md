# Brand DNA v1

`brand-dna-v1` 是 Desktop 品牌 DNA 分析使用的独立深度协议，不修改现有视觉分析 Prompt 或 `runV5Pipeline()`。

执行阶段：

1. 文档准备与语义切分
2. 原子证据提取
3. 事实归一化与冲突复核
4. 品牌战略模型重建
5. 批判性战略诊断
6. 七类品牌 DNA 合成
7. 唯一创意命题内部比较与决策
8. 品牌 DNA 到视觉变量的因果映射
9. GPT Image Task Standard 编译
10. 独立质量审计、一次定向修复与复审
11. 本地 Markdown 报告编译

正式报告只有在以下条件同时满足时才会保存：

- 总分不低于 85
- 证据与事实准确性不低于 17/20
- 战略重建不低于 17/20
- GPT 生图可执行性不低于 9/10
- 没有 hard failure

模型默认质量等级为 `experimental`。仓库已建立 12 个跨行业固定样本的 A/B/C 对照清单，但在真实 GPT-5.6 对照和盲评完成之前，系统不会宣称任何模型达到 `benchmark`，也不会把协议标记为 Reusable Protocol。
