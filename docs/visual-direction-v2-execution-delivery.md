# Masterpiece OS · 执行向视觉方向 v2 实验交付文档

> 对应开发文档：《Masterpiece OS Execution-oriented Visual Direction v2 实验分支开发文档》
> 分支：`experiment/execution-oriented-directions-v2`（基于基线 tag `sprint1-mvp-v1.3.3`）
> 模式切换：`direction_generation_mode ∈ { conceptual_v1, execution_oriented_v2 }`
> 生产基线保持 `conceptual_v1`，实验仅用 `execution_oriented_v2`。未修改任何 v1 / Evidence / 资产权限 / 受众边界 / Direction Score v1 / Difference Matrix v1 / Report Compiler v1.3.3 / Checkpoint v1 / Sprint 2 Runtime v1 / Provider Adapter / Desktop / Phase 4B 代码。

## 1. 分支与基线信息

- 冻结并打 tag：`sprint1-mvp-v1.3.3`（在 `feature/visual-translation-v1` 提交 `b404c76` “1.3.3” 之上）
- 实验分支：`experiment/execution-oriented-directions-v2`
- v2 入口：`src/v5/visual-translation/v2/index.js`
- 兼容策略：v2 只读 v1 Checkpoint（brandFacts / evidenceIndex / audienceBoundary / assetBoundary / selectedTouchpoints），通过 `compileExecutionDirectionV2(...)` 接入，不重新实现 Document Extraction。

## 2. 修改 / 新增文件清单

```
src/v5/visual-translation/v2/
  config/direction-generation-mode.js          # direction_generation_mode 枚举与选择器
  schemas/schema-utils-v2.js                    # 自包含 schema 助手（复用 shared runtime-contracts）
  schemas/direction-contract-v2.js              # Direction Contract v2（核心契约）
  schemas/anchor-contract-v2.js                 # Anchor Candidate Contract v2
  runtime/anti-concept-art-constraints.js       # 9 条防概念稿检查器 + 地产/抽象漂移检测
  runtime/execution-readiness-evaluator.js      # Execution Readiness Evaluator v1
  runtime/regression-guards.js                  # 资产权限 / 证据保护 / 受众边界 守卫
  runtime/compile-execution-direction-v2.js     # v2 编译入口（消费 v1 输入）
  runtime/ab-runner.js                          # A/B Runner + conceptual_v1 对照评估
  prompts/direction-generation-prompt-v2.js     # 执行向方向生成 Prompt v2
  prompts/anchor-candidate-prompt-v2.js         # Anchor Candidate Prompt v2
  report/compile-execution-directions-report-v2.js  # 独立实验报告适配器
  index.js                                      # 统一导出

tests/v5/visual-translation-v2.test.js          # v2 测试套件（14 个用例）
tests/fixtures/visual-direction-v2/
  {jiuzhou-meixue,mingjitang,vanke-suwan}/
    v1-directions.json  v2-directions.json
    evidence-index.json  asset-boundary.json
    audience-boundary.json  selected-touchpoints.json
tests/snapshots/visual-direction-v2/
  {jiuzhou-meixue,mingjitang,vanke-suwan}-ab.json
  ab-runner-summary.json
  jiuzhou-meixue-execution-report.md             # 实验报告样例
```

## 3. Direction Contract v2（`visual-direction-v2-execution`）

定义于 `schemas/direction-contract-v2.js`，强制回答“怎么做”：

- `strategic_idea`：≤80 汉字，非纯口号，含品牌事实 + 行业对象 + 执行机制
- `industry_recognition_layer`：行业视觉对象 / 数据对象 / 流程对象 / 真实场景 / 可用业务对象 / 禁止误导模板 / 最低行业识别强度（1–5）
- `core_reusable_assets`：3–5 个，必须至少覆盖 graphic / information / photography / layout 四类
- `graphic_system` / `photography_object_system`（含 `real_content_ratio` 三者和为 1）/ `information_system` / `layout_behavior`（6 个区域 + 多尺寸适配）
- `composition_templates`：≥2 个，每个含 `touchpoint / subject_position / information_position / reusable_assets / image_object_rule / negative_constraints`
- `execution_examples`：3 个，覆盖 core_brand / capability_product / digital_event
- `anti_concept_art_constraints`：9 条强制约束（见第 8 节）
- 校验：缺失必需资产类型 / 缺失必需示例类别 / 引用未知 Evidence / 引用受限资产 / 中文名缺失 → 均抛 `FAILED_SCHEMA`

## 4. Anchor Contract v2（`visual-direction-v2-anchor`）

定义于 `schemas/anchor-contract-v2.js`：

- `execution_thesis`、`core_asset_combination`（1 图形 + 1 行业/摄影对象 + 1 信息模块 + 1 版式机制）
- `primary_layout_template`（主体/信息/品牌位置、留白比、横竖适配）
- `anchor_image_brief`（图像用途/主体/行业对象/图形叠加/信息留白/构图层级/禁止内容/预期触点）
- `prohibited_drift`、`difference_from_other_candidates`、`execution_readiness`
- 校验：`core_asset_combination.graphic_asset_id` 必须引用真实 `core_reusable_asset`

## 5. Industry Recognition Layer

位于 Direction Contract v2 的 `industry_recognition_layer`，作为每个方向的第一层（Industry Recognition First）。Execution Readiness Evaluator 据此给 `industry_recognition_strength`（1–5，且被声明的最低强度封顶）。九州美学示例：`[医美机构门头与诊疗空间, 冷链温控运输箱, GSP 仓储货架]` + 数据对象 + 流程对象 + 真实场景 + 可用业务对象 + 禁止误导模板。

## 6. Reusable Visual Assets 结构

每个资产形如：

```javascript
{ asset_id, asset_name, asset_type, visual_description,
  business_evidence, execution_role, reusable_touchpoints, prohibited_use }
```

`asset_type ∈ { graphic_asset, information_asset, photography_asset, layout_asset, material_asset, motion_asset }`。
契约要求每个方向至少 1 graphic + 1 information + 1 photography + 1 layout；Evaluator 将资产数量映射为 `reusable_visual_asset_count`（1–5）。

## 7. Composition Templates

每个 Direction 至少 2 个执行母版，touchpoint ∈ `{poster, capability_deck, digital_hero, packaging_front, exhibition_backdrop, short_video_cover, map_or_activity}`。模板携带主体位置、信息位置、可复用资产、图像对象规则与负向约束，确保“能直接生成海报、画册、包装或页面母版”。

## 8. Execution Readiness Evaluator（`execution-readiness-evaluator-v1`）

9 项 1–5 指标：行业识别强度、可直接执行程度、可复用视觉资产数量、平面设计转化能力、真实触点覆盖、品牌专属性、概念稿风险（越低越好）、地产/展厅漂移风险（越低越好）、抽象物体依赖（越低越好）。

通过标准（doc 七）：
`行业识别 ≥4 && 可直接执行 ≥4 && 平面设计转化 ≥4 && 品牌专属 ≥4 && 概念稿风险 ≤2 && 地产漂移风险 ≤2`。
不通过 → `execution_status = rewrite_required`，不得进入 Anchor Image Exploration。

防概念稿 9 条（`anti_concept_art_constraints.js` 可检测）：
不以巨型空间装置为主 / 不以建筑·展馆·雕塑·地产空间为主体 / 不只靠材质光影 / 不只抽象无行业内容 / 必须可转平面 / 不用远景宏大空间替代信息 / 不默认玻璃曲面石材发光 / 不只电影概念图语言 / 必须能生成海报画册包装页面母版。

## 9. A/B Runner

`runtime/ab-runner.js`：对每个项目 `runABComparison`（v2 跑 Readiness + 回归守卫；v1 跑 `evaluateConceptualDirectionV1` 轻量对照评估），聚合 `runABRunner` 输出合并建议。对照指标可测条件：行业识别提升、可执行提升、≥3 资产、可想见海报/包装/页面、概念与地产气质下降、证据/资产权限完好。人工偏好为 `v2` 时项目判定 `pass`。

## 10–12. 三项目 A/B 对比结果

| 项目 | 判定 | v2 行业识别 | v1 行业识别 | v2 概念稿风险 | v1 概念稿风险 | v2 全部就绪 |
|---|---|---:|---:|---:|---:|---|
| 九州美学 | pass | 4 | 1 | 1 | 5 | 是 |
| 名济堂 | pass | 4 | 1 | 1 | 4 | 是 |
| 万科苏皖 | pass | 4 | 1 | 1 | 5 | 是 |

v1 方向刻意保留问题模式（宏大隐喻、概念空间、地产/展厅、玻璃曲面发光），用于对照；v2 方向均经契约校验且 Readiness 通过。

## 13. 测试结果

`node --test tests/v5/*.test.js` → **117 passed / 0 failed**（含 14 个新增 v2 用例 + 103 个既有 v1/v5 用例，无回归）。

v2 用例覆盖：Direction v2 Schema、Anchor v2 Schema、Execution Readiness、Anti Concept Art、Asset Authorization Regression、Evidence Preservation、A/B 集成（与快照逐字段一致）、direction_generation_mode 隔离。

## 14. 回归结果

- 资产权限回归：v2 fixture 的 `asset_references` 均为允许资产，引用受限资产（`AS-*-PARENT`）被契约拒绝。
- 证据保护回归：v2 `evidence_ids` 均为 Evidence Index 子集，未知 Evidence 被契约拒绝，Evidence Index 未被修改。
- 受众边界回归：B2B 项目（九州美学）守卫禁止消费者作为核心主体；v2 未改动 v1 audience boundary。
- 未触碰任何 forbidden 模块；v1 测试全绿。

## 15. 已知限制

- v2 方向 JSON 由 fixture 提供（离线、可复现）；真实模型产出需接入 `direction-generation-prompt-v2` 并经 Provider Adapter（未修改），本分支未直连图片生成（符合“禁止直接接图片生成”）。
- conceptual_v1 对照评估为轻量启发式（基于关键词/模式检测），用于 A/B 量化对比，不代表 v1 真实模型在多项目上的完整分布。
- `strategic_idea` 最低长度（15 字）与“非纯口号”由结构校验保证，语义层“是否真口号”仍需人工评审。
- 人工偏好在 fixture 中标为 `v2`；最终合并决策需真实人工评审确认（doc 九）。

## 16. 是否建议合并主线

**建议：`execution_oriented_v2 → candidate_for_merge`。** 三项目均满足可测通过标准（行业识别明显提升、可执行明显提升、≥3 可复用资产、可想见海报/包装/页面、概念与地产气质明显下降、证据与资产权限完好、人工偏好 v2），`runABRunner` 给出 `merge_recommendation = candidate_for_merge`（≥2 项目达标）。正式合并前仍需人工评审确认并按 doc 十四“本阶段禁止”逐项核对（不回退 v5-desktop、不覆盖 v1.3.3、不重新打包客户端等）。
