# Retrieval-First 跨行业冻结测试

这套工具只消费已经完成的 Retrieval-First 项目记录，不修改 Prompt、Gate、Critic 或报告模板。

## 1. 建立冻结基线

先提交待冻结版本，确保工作区干净，然后运行：

```powershell
npm run freeze:cross-industry -- baseline `
  --output cross-industry-freeze-test/00-baseline/baseline.json
```

命令会记录当前 Git Commit，并为冻结组件生成 SHA-256 清单。工作区存在未提交修改时会拒绝建立正式基线。`--allow-dirty` 仅用于开发调试；使用该基线的冻结结果不能通过。

## 2. 准备项目记录

输入 JSON 的顶层结构为：

```json
{
  "baseline": {
    "commit": "Git commit",
    "tag": "retrieval-first-cross-industry-baseline",
    "dirty_worktree": false,
    "frozen_component_manifest": {}
  },
  "records": []
}
```

每个项目记录必须包含：

- 测试编号、项目类型、行业、商业模式和 A/B/C 输入类型；
- Pipeline、Retrieval、品牌理解、Evidence、方向、Critic 和 Anchor 结果；
- 十个统一评分维度以及逐方向视觉可生成性；
- 输入清单、正式报告、Audit 和 Runtime Log 的本地路径；
- 已按五类缺陷归类的问题记录。

可参考 [cross-industry-freeze.test.js](../tests/v5/cross-industry-freeze.test.js) 中的完整 Fixture。

## 3. 执行汇总

```powershell
npm run freeze:cross-industry -- evaluate `
  --input freeze-records.json `
  --output cross-industry-freeze-test
```

执行器会：

1. 复核冻结组件是否漂移；
2. 逐项目计算通过、条件通过或失败；
3. 计算 Pipeline、Benchmark、品牌理解、Evidence、方向差异、Critic 和 Anchor 比率；
4. 检查项目组合与 A/B/C 输入覆盖；
5. 识别三项目重复缺陷和单项目高风险事实问题；
6. 复制输入清单、正式报告、Audit 和 Runtime Log；
7. 生成跨项目矩阵、重复缺陷、模型波动、Anchor Smoke Test 与最终冻结决策。

退出码：

- `0`：执行完成，结果为通过或项目数不足；
- `1`：输入、基线或文件错误；
- `2`：冻结失败或冻结组件发生漂移。

