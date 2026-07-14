# Design Factory OS

Design Factory OS 是一个面向品牌视觉项目前期分析、生产规划、知识审核和设计师成长复盘的本地工具。v2.0 的 Design Review & Growth Engine 定位是“AI 设计导师，而不是 AI 打分器”：每项评分必须有证据，每个问题必须给出可执行建议。

- 项目分析、Brand Lock、优秀案例、缺图与图片规划
- 自包含的《Chat 生图任务包》
- Knowledge Candidate 与 Knowledge Analysis 合并审核
- Brand、Packaging、Visual System、Portfolio、Benchmark 专业评审
- 八维能力雷达、历史趋势、成长建议和训练路线

## 环境

- Node.js 20 或更高版本
- 无第三方运行依赖，无需 `npm install`

## 快速开始

将已命名的视觉项目文件夹直接放入 `projects/`：

```text
projects/
└── 我的品牌/
    ├── 01.jpg
    ├── logo/
    └── 品牌说明.md
```

运行：

```bash
npm run analyze -- --project "我的品牌" --online
```

系统会把项目根目录素材原样移动到 `input/`，创建 `outputs/`，随后只读 `input/` 并把报告写入 `outputs/`。不覆盖同名文件，不打散子目录，重复运行不会反复移动。只有一个项目时可以省略 `--project`。

```text
projects/我的品牌/
├── input/
│   ├── 01.jpg
│   ├── logo/
│   └── 品牌说明.md
└── outputs/
```

不希望联网时省略 `--online`，工具会使用内置策展案例库，结果可复现。直接传入素材目录的旧用法仍然兼容。

正式模式每次生成：

- `01-项目分析报告.md`
- `02-Chat生图任务包.md`
- `03-Knowledge-Review.md`
- `04-Design-Review.md`

添加 `--debug` 才会额外输出 `design-factory-result.json`。每次评审还会在本地 `history/reviews/` 保存 `.review.json` 与 `.review.md`，供第二个项目开始计算成长趋势；真实历史记录由 Git 忽略。

Knowledge Review 只读取 `knowledge/approved/`。引擎不会自动修改 Knowledge、Rule、Prompt 或 Template，也不会执行 Git Commit/Push。

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
  "reviewScores": {
    "摄影": 80,
    "版式": 75
  },
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

工具不会把低置信度推断包装成事实。缺失主色、Logo 或盒型时，Brand Lock 和任务包会明确标记“待确认”；无法可靠自动判断的网格、留白等会标为“证据不足”。`reviewScores` 可由人工覆盖八个固定维度的评分，但报告仍保留评分依据。

## 开发与测试

```bash
npm test
```

回归测试覆盖三个完全自制的匿名 Demo，检查四份正式输出、Design Review、首次/后续项目成长趋势、历史记录和 Git 数据边界。仓库只跟踪 `projects/.gitkeep` 与 `history/reviews/.gitkeep`；真实项目和历史记录均不得提交到 GitHub。

文件边界与提交规则见 [docs/GitHub文件管理规范.md](docs/GitHub文件管理规范.md)。

更多说明见 [Design Review & Growth Engine](docs/Design-Review-Growth-Engine.md)、[项目自动初始化](docs/项目自动初始化.md)、[使用手册](docs/使用手册.md) 与 [架构说明](docs/架构说明.md)。
