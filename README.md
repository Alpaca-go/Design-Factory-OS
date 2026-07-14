# Design Factory OS

Design Factory OS 是一个面向品牌视觉项目前期分析、生产规划和知识审核的本地工具。它盘点 ZIP、PDF、PPT/PPTX、图片和文本素材，并生成一套可追溯、可人工校正的设计交付物：

- 素材清单
- Brand Lock
- 《视觉方案优化报告》
- 缺图分析与优先补充的 3 张图片
- 13 张图片规划及逐张任务卡
- 自包含的《Chat 生图任务包》
- Knowledge Candidate 候选清单
- Knowledge Analysis 知识影响分析

## 环境

- Node.js 20 或更高版本
- 无第三方运行依赖，无需 `npm install`

## 快速开始

```bash
node bin/design-factory.js init ./my-brand --name "我的品牌"
# 把素材放入 ./my-brand/assets，并完善 design-factory.json
node bin/design-factory.js analyze ./my-brand --online
```

默认输出到项目中的 `outputs/`。不希望联网时省略 `--online`，工具会使用内置策展案例库，结果可复现。

每次完整运行必定生成：

- `Chat生图任务包.md`
- `Knowledge-Candidate.md`
- `Knowledge-Analysis.md`

Knowledge Analysis 只读取 `knowledge/approved/`，不会自动新增、修改、删除 Rule 或升级知识等级。

也可以只盘点素材：

```bash
node bin/design-factory.js inventory ./my-brand --json
```

## 项目配置

`design-factory.json` 用于覆盖自动识别。明确配置的品牌事实优先于素材启发式判断：

```json
{
  "projectName": "匿名文旅 Demo",
  "projectType": "品牌视觉升级",
  "industry": "文化旅游",
  "brand": {
    "name": "匿名文旅 Demo",
    "primaryColor": "#8B1E2D",
    "secondaryColors": ["#D8B36A", "#F3EBDD"],
    "fonts": ["思源宋体"],
    "fontTemperament": "东方、人文、当代",
    "packaging": ["天地盖礼盒"],
    "coreVisualAssets": ["山水留白", "传统纹样"]
  },
  "benchmarks": [
    { "name": "案例名", "url": "https://example.com", "reason": "入选理由" }
  ],
  "knowledgeCandidates": [
    {
      "id": "KC-001",
      "title": "包装展示图片结构",
      "category": "Packaging",
      "content": "包装展示建议包含正面、组合、工艺细节和开盒展示。",
      "reason": "经过两个匿名项目验证",
      "verifiedProjects": ["匿名项目 A", "匿名项目 B"]
    }
  ]
}
```

## 输出约定

工具不会把低置信度推断包装成事实。缺失主色、Logo 或盒型时，Brand Lock 和任务包会明确标记“待确认”；Chat 执行者必须暂停相关图片，而不是自行发明资产。

## 开发与测试

```bash
npm test
```

回归测试覆盖三个完全自制的匿名 Demo，检查 Brand Lock、缺图分析、13 张任务规划、任务包和 Knowledge Analysis 的一致性。真实项目必须存放在仓库外的 `Design-Factory-Projects/`，不得提交到 GitHub。

文件边界与提交规则见 [docs/GitHub文件管理规范.md](docs/GitHub文件管理规范.md)。

更多说明见 [docs/使用手册.md](docs/使用手册.md) 与 [docs/架构说明.md](docs/架构说明.md)。
