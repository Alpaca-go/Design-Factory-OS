# Design Factory OS

Design Factory OS v3.1 是一个 **AI Creative Brief Generator**。它从项目素材和人工核验过的视觉事实中理解品牌，建立 Brand Lock、对标语境与 Creative Reasoning，再输出可交给品牌设计师、创意团队或其他创作工具继续发展的专业 Creative Brief。

系统负责理解品牌与说明创意边界，不代替创意团队设计，也不规划图片数量、比例或生图任务。

```text
Visuals
→ Brand Lock
→ Benchmark
→ Creative Reasoning
→ Creative Brief
→ Human / Creative Team
```

## 环境

- Node.js 20 或更高版本
- 无第三方运行依赖，无需 `npm install`

## 快速开始

把素材放入 `projects/<项目名称>/input/`，在项目根目录填写 `design-factory.json`，然后执行：

```bash
npm run analyze -- --project "我的品牌" --online
```

项目不存在标准目录时，初始化器会安全创建 `input/` 和 `outputs/`。项目真实素材仍由 `.gitignore` 排除。

也可以直接分析一个素材目录：

```bash
npm run analyze -- "D:/path/to/assets" --output "D:/path/to/output"
```

## 固定输出

每次分析只生成四份 Markdown：

- `01-项目分析报告.md`：项目证据、Brand Lock、Benchmark 与关键推理
- `02-Creative-Brief.md`：供专业创意团队使用的十部分简报
- `03-Knowledge-Review.md`：可复用思考问题与本项目待回答问题
- `04-Design-Review.md`：Creative Brief 的证据完整度与进入创意发展的准备度

使用 `--debug` 时会额外生成结构化的 `design-factory-result.json`，但不会新增其他 Markdown。

## Creative Brief 的十部分

1. Brand Identity：品牌真正是什么，而不只是卖什么
2. Brand Positioning：品牌在竞争环境中的位置与依据
3. Design Language：可执行的设计关系、原则与理由
4. Emotional Direction：希望与不希望产生的感受
5. Visual DNA：Logo、色彩、字体、构图、留白、摄影、材质、包装与工艺
6. Photography Direction：光线、取景、景深、材质与氛围方向
7. Design Risks：容易偏离品牌的设计风险与原因
8. Must Keep：必须继承的长期品牌资产
9. Can Explore：允许创意团队探索的空间
10. Design Goal：本项目最终需要建立的品牌效果

Creative Brief 不是 Prompt，不包含对 AI 的命令、关键词堆砌、图片数量、画幅比例或任务卡。

## 逐张视觉核验

文件名、OCR、尺寸和元数据不能替代画面判断。实际查看全部图片后，应在 `design-factory.json` 记录核验结果：

```json
{
  "visualInspection": {
    "verified": true,
    "inspectedImageCount": 12,
    "inspectedImages": ["01.png", "02.png"],
    "findings": [
      "主视觉使用稳定的非对称网格与大面积留白",
      "产品摄影采用暖色侧逆光和真实接触阴影"
    ]
  }
}
```

只有 `verified=true` 且核验数量覆盖全部图片时，系统才把视觉核验视为闭环。证据不足的内容会标为“待确认”，不会自行编造。

## Creative Reasoning 配置

```json
{
  "creativeReasoning": {
    "brandIdentity": {
      "statement": "以克制东方审美连接日常生活的品牌。",
      "evidence": ["包装、空间与摄影均使用安静的材质表达"]
    },
    "brandPositioning": {
      "statement": "面向重视文化质感与日常体验的当代生活方式品牌。",
      "evidence": ["产品层级、渠道与公开同类案例"]
    },
    "designLanguage": {
      "statement": "克制、温暖、结构清晰。",
      "rationale": ["避免装饰压过产品与品牌内容"],
      "principles": ["单一视觉重心", "稳定网格", "真实材质"]
    },
    "emotionalDirection": {
      "statement": "安静但不疏离。",
      "desiredFeelings": ["可信", "温暖", "精致"],
      "avoidFeelings": ["浮夸", "廉价", "模板化"],
      "evidence": ["低饱和色彩与柔和侧光"]
    },
    "visualDNA": {
      "logo": "只使用已确认的授权标志文件。",
      "color": "深红为识别锚点，米白承担呼吸空间。",
      "typography": "以清晰层级和克制字重建立秩序。",
      "composition": "单一主体与非对称网格。",
      "whitespace": "保留稳定呼吸区。",
      "photography": "柔和侧光、真实阴影。",
      "materials": "无涂布纸、木材与真实产品材质。",
      "packaging": "沿用已确认盒型和开合逻辑。",
      "craft": "压凹与局部工艺只服务信息层级。"
    },
    "photographyDirection": {
      "lighting": "柔和侧光，控制高光。",
      "framing": "接近使用者视角，主体尺度明确。",
      "depth": "中等景深，环境信息不过度抢占。",
      "materials": "保留纸张、木材和产品的真实触感。",
      "atmosphere": "安静、温暖、可信。"
    },
    "designRisks": [
      {
        "problem": "东方感被处理成符号堆砌",
        "reason": "依赖表面装饰而没有结构与材质逻辑",
        "prevention": "优先用比例、留白、触感和内容关系表达"
      }
    ],
    "mustKeep": ["授权 Logo", "品牌主色", "已确认包装结构"],
    "canExplore": ["摄影叙事", "空间尺度", "材质组合"],
    "designGoal": "建立能跨包装、空间与数字触点稳定表达的品牌视觉体系。"
  }
}
```

完整空模板见 `templates/design-factory.json`。

## Thinking Framework

v3.1 的 Knowledge 保存问题，不保存项目答案或自动规则：

```text
knowledge/thinking/
├── identity.md
├── emotion.md
├── visual.md
├── brand.md
└── portfolio.md
```

这些问题帮助设计师审视身份、情绪、视觉、定位与作品集连贯性。分析过程只读该目录，不会把单个项目结论写回系统知识。

## 安全边界

- 不把未经核验的信息包装成事实。
- 不用对标案例替代本项目证据。
- 不生成图片、图片任务、Prompt、数量或画幅比例计划。
- 不自动修改 Knowledge、Rule 或 Template。
- 不自动执行 Git Commit、Push 或其他 Git 操作。

## 开发与测试

```bash
npm test
npm run test:regression
```

更多说明见 [使用手册](docs/使用手册.md)、[架构说明](docs/架构说明.md)、[项目自动初始化](docs/项目自动初始化.md) 与 [GitHub 文件管理规范](docs/GitHub文件管理规范.md)。
