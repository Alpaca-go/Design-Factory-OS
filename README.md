# Design Factory OS

Design Factory OS 是一个面向品牌视觉项目前期分析与生产规划的本地工具。它盘点 ZIP、PDF、PPT/PPTX、图片和文本素材，并生成一套可追溯、可人工校正的设计交付物：

- 素材清单
- Brand Lock
- 《视觉方案优化报告》
- 缺图分析与优先补充的 3 张图片
- 13 张图片规划及逐张任务卡
- 自包含的《Chat 生图任务包》

## 环境

- Node.js 20 或更高版本
- 无第三方运行依赖，无需 `npm install`

## 快速开始

```bash
node bin/design-factory.js init ./my-brand --name "我的品牌"
# 把素材放入 ./my-brand/assets，并完善 design-factory.json
node bin/design-factory.js analyze ./my-brand --online
```

默认输出到项目中的 `design-factory-output/`。不希望联网时省略 `--online`，工具会使用内置策展案例库，结果可复现。

也可以只盘点素材：

```bash
node bin/design-factory.js inventory ./my-brand --json
```

## 项目配置

`design-factory.json` 用于覆盖自动识别。明确配置的品牌事实优先于素材启发式判断：

```json
{
  "projectName": "九州美学",
  "projectType": "品牌视觉升级",
  "industry": "文化旅游",
  "brand": {
    "name": "九州美学",
    "primaryColor": "#8B1E2D",
    "secondaryColors": ["#D8B36A", "#F3EBDD"],
    "fonts": ["思源宋体"],
    "fontTemperament": "东方、人文、当代",
    "packaging": ["天地盖礼盒"],
    "coreVisualAssets": ["山水留白", "传统纹样"]
  },
  "benchmarks": [
    { "name": "案例名", "url": "https://example.com", "reason": "入选理由" }
  ]
}
```

## 输出约定

工具不会把低置信度推断包装成事实。缺失主色、Logo 或盒型时，Brand Lock 和任务包会明确标记“待确认”；Chat 执行者必须暂停相关图片，而不是自行发明资产。

## 开发与测试

```bash
npm test
```

回归测试覆盖“九州美学”“帅府”“小熊工坊”三个长期项目，检查 Brand Lock、缺图分析、13 张任务规划和任务包结构的一致性。

更多说明见 [docs/使用手册.md](docs/使用手册.md) 与 [docs/架构说明.md](docs/架构说明.md)。
