# Roadmap

## v1.0

- [x] 素材盘点：ZIP、PDF、PPTX、常见图片及文本
- [x] Brand Lock 识别与配置覆盖
- [x] 可选联网对标、内置案例库与 P0/P1/P2
- [x] 缺图矩阵、13 张图片规划与 Chat 生图任务包
- [x] 三项目长期回归测试

## v1.1

- [x] Knowledge Candidate 标准输出
- [x] Knowledge Analysis 新增、更新、重复与项目经验分类
- [x] 五类知识库健康度、P0–P3 优先级与人工审核清单
- [x] Approved Rule 只读加载和防修改测试

## v1.2

- [x] `projects/` 自动初始化与 `.gitkeep`
- [x] `--project` 选择、单项目自动选择与多项目防误选
- [x] 素材安全移动、冲突预检、路径越界保护和幂等运行
- [x] 旧版 `inputs/` 到标准 `input/` 的兼容迁移

## v2.0

- [x] Design Review 五类专业评审与 P0/P1/P2
- [x] 至少 3 条 Strengths 与 5 条可执行 Improvement
- [x] 八维能力雷达、七项历史趋势和 Top 3 训练路线
- [x] 本地 review.json / review.md 历史记录
- [x] 四份正式输出与可选调试 JSON

## v3.0

- [x] 新增 Creative Reasoning，建立品牌定位、关键词、气质与视觉 DNA
- [x] 新增摄影语言、创意方向和 Design Risks
- [x] Chat 生图任务包重构为“品牌设计意图 + 图片任务”两层结构
- [x] Fast Mode 成为默认，仅生成两份核心报告
- [x] Review/Research Mode 保留四份编号报告和 Knowledge 只读边界
- [x] 增加逐张视觉核验状态，阻止把文件名、OCR、尺寸或元数据当作画面事实

## v3.1（当前）

- [x] 产品定位升级为 AI Creative Brief Generator
- [x] Creative Reasoning 扩展为十部分专业 Creative Brief 契约
- [x] 固定输出项目分析、Creative Brief、Knowledge Review 与 Design Review
- [x] 删除图片数量、画幅、任务卡和 Chat 生图执行规划
- [x] Knowledge 重构为 identity、emotion、visual、brand、portfolio 五类思考问题
- [x] Design Review 改为 Brief 证据完整度与创意准备度检查
- [x] CLI、模板、Skill、规则、文档与测试统一到 v3.1

## 后续版本

- [ ] 增强旧版 `.ppt` 解析（当前只登记文件，深度解析针对 `.pptx`）
- [ ] 增加 JPEG/WebP 像素级主色抽样
- [ ] 增加可插拔搜索提供商与案例人工审阅状态

- [ ] HTML 可视化报告
- [ ] Creative Brief 协作批注与版本比较
- [ ] Benchmark 来源可信度和定位相似度辅助审阅
