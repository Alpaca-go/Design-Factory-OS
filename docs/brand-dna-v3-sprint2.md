# Brand DNA v3 Sprint 2 交付记录

## 修改范围

- 新增 `visual-system-task-plan` 单一视觉决策阶段。
- 一次生成品牌专属资产、九类视觉方向、Image System、Generation Boundary 和 2～8 张任务骨架。
- 视觉阶段只读取 Approved Decision，不再读取完整文档或全部原文引用。
- 任务骨架不包含长 Prompt；Anchor 的 Previous Tasks 强制为空，后续任务强制非空。
- Locked Facts、Locked Assets、建议元素、创作自由、禁止元素和待确认项严格分离。

## 版本与 Checkpoint

- Prompt：`visual-system-task-plan-prompt-v3.1`
- Schema：`visual-system-task-plan-v3`
- Stage：`05-visual-system-task-plan`
- Checkpoint 上游 Hash 只依赖 Approved Brand Creative Decision。

## 测试与调用

- 核心两次调用后增加一次视觉规划调用；Sprint 2 完成时短文档累计 3 次模型调用。
- 离线测试验证四张不同职责任务、专属“安心轨迹”资产、Anchor 空 Previous Tasks 和无长 Prompt。
- 未执行真实模型 Token/耗时测试。

## 回滚与合并建议

删除 Sprint 2 模块不会影响 Sprint 1 核心报告。建议继续保留在功能分支，完成 Sprint 3 后再考虑 Desktop 灰度。
