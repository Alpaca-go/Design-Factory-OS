# 九州美学 视觉方向 v2.1.2 Precision Patch 新旧对比

| 维度 | 旧（同质/退化输入） | 新（v2.1.2 好集合） |
| --- | --- | --- |
| 整体状态 | rewrite_required | ready |
| 整体执行许可 | blocked | allowed |
| 阻断原因数 | 17 | 0 |
| 方向家族差异 | 重叠(需重写) | 正常 |
| 消费者价值覆盖 | 缺失 | 已覆盖 |
| E02 美学门槛 | 未达(需重写) | 达标 |
| 业务模型覆盖 | 不足 | 充分 |
| 合规权重 | 需重写 | 通过 |
| 品牌身份保护 | 通过 | 通过 |
| 伪造数据检测 | 0阻断/0总检测 | 0阻断/0总检测 |
| 消费者角色/权重一致 | 不一致(需重写) | 一致 |
| Asset ID 全局唯一 | 唯一 | 唯一 |
| 空间漂移(E03) | 通过 | 通过 |

> 旧报告（退化输入）对应文件：jiuzhou-meixue-execution-report-degenerate.md
> 新报告（v2.1.2 好集合）对应文件：jiuzhou-meixue-execution-report-v212.md

## v2.1.2 Precision Patch 关键改进

1. **品牌身份保护**：增加置信度评分(0.1-0.98)、上下文分析、非品牌短语排除、hard-block/warning 分级
2. **伪造数据降噪**：设计语境字段（画布比例/图文比例/版式参数）不再触发 blocked，仅保留 field_structure warning
3. **E02 Degradation 组合评分**：6 维评分（lab_scene / scientific_info / product_presentation / brand_aesthetic / consumer_value / execution_variety），组合阈值触发阻断
4. **Execution Example 展示补全**：补齐 18 个字段，主报告只显示 blocked + 最多 5 条高置信 warning
5. **Consumer Role/Weight 一致性**：修复 E02/E03 的 consumer_value_role 从 primary 改为 strong_secondary，权重对齐 0.10
6. **Asset ID 全局唯一**：确保 E01/E02/E03 方向资产 ID 不重复
7. **Spatial Drift(E03)**：禁止句过滤后 per-direction max 计数，避免误报