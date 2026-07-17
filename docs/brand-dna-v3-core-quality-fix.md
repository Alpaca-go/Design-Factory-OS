# Brand DNA V3 核心报告质量修复交付记录

## 修改范围

- Decision Schema 升级为 `brand-dna-decision-schema-v3`，核心协议保持 `brand-dna-v3-deep-compact`。
- Project Identity 增加 `analysisTaskName` 和定位状态，确定性移除项目名中的分析任务词。
- Audience 使用 `primary / secondary / extension`，Needs、Barriers、Use Cases 改为带状态和 Evidence 的 Insight Item。
- Gene 固定为 G01～G07；Cultural 增加四级 maturity；单一来源的软性基因、声明型文化和未决审美方向自动校准置信度。
- Risk 统一为逐条状态、严重度、主题、证据和独立建议行动；无充分边界的绝对化表达自动降为合理推断。
- Creative Thesis 增加 Gene IDs，专属视觉机制保持在核心 Decision 内。
- Core Report 先构建只读 View Model，再由本地 Markdown Compiler 输出，不读取未经校验的模型原始字段。

## 九州美学修复前后

| 项目 | 修复前 | 修复后 |
|---|---|---|
| 项目名称 | 九州美学品牌战略升级 | 九州美学 |
| 分析任务 | 混入标题或丢失 | 品牌战略升级，独立展示 |
| Industry / Role / Positioning | 容易混写 | 三字段独立校验，定位带状态 |
| Functional | 容易写成仓储、网络、资质 | 强制写客户获得的结果 |
| Capability | 容易只剩数字化能力 | 强制包含系统、资源、资质或组织基础 |
| Cultural | 无成熟度或过度确认 | 显示 declared / embedded / aspirational |
| Gene Confidence | 接近全部高 | 按来源、成熟度和视觉未决状态校准 |
| Risk | 状态不完整 | 每条都有中文状态、严重度和建议行动 |
| Creative Thesis | 展示不完整 | 核心报告包含命题、依据、Gene IDs 和覆盖度 |
| Visual Mechanism | 未形成核心章节 | 核心报告独立展示专属机制候选 |
| Report | 更接近 V2 | V3 头、执行摘要、G01～G07、质量闸门及运行附录 |

## 稳定性与性能

- 未增加模型阶段：短文档核心仍为 2 次模型调用，完整正常路径仍为 5 次。
- 未增加完整对象 Repair；仅保留原有受限 JSON Path Patch。
- Checkpoint 结构保持不变；Decision Prompt/Schema 版本更新后只使旧 Decision Checkpoint 安全失效一次，Evidence Checkpoint 可继续复用。
- Usage、耗时和模型信息仍从 Provider 响应写入运行元数据。
- 新增处理均为本地线性遍历；离线回归未观察到可感知耗时增加。
- 未调用真实 Provider，因此真实 Qwen Token 增量和端到端耗时需在用户授权的 A/B 中记录；本次不虚构数据。

## 合并建议

建议合并到 V3 灰度分支。真实 Provider 连续样本通过前仍不建议取消 V2 回滚入口。
