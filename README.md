# Masterpiece-OS

Masterpiece-OS v3.2 是一个 **AI Creative Brief Generator**。它从项目素材、原始品牌意图和人工核验过的视觉事实中理解品牌，先完成可追溯的 Brand DNA Decision，再输出可交给 GPT 或专业创意团队继续发展的 Creative Brief。

系统负责理解品牌与说明创意边界，不代替创意团队设计，也不规划图片数量、比例或生图任务。

```text
Visuals
→ Brand Lock
→ Original Intent
→ Industry Benchmark
→ Creative Decision
→ Approved Brand DNA
→ Creative Brief
→ GPT / Creative Team
```

## 环境

- Node.js 20 或更高版本
- 无第三方运行依赖，无需 `npm install`

## 快速开始

把素材放入 `projects/<项目名称>/input/`，在项目根目录填写 `masterpiece-os.json`，然后执行：

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

使用 `--debug` 时会额外生成结构化的 `masterpiece-os-result.json`，但不会新增其他 Markdown。

## Creative Brief 的十部分

1. Brand Identity：品牌真正是什么，而不只是卖什么
2. Brand Positioning：品牌在竞争环境中的位置与依据
3. Design Language：可执行的设计关系、原则与理由
4. Emotional Direction：希望与不希望产生的感受
5. Approved Brand DNA：经过决策链批准的 Logo、色彩、字体、构图、留白、摄影、材质、包装与工艺
6. Photography Direction：光线、取景、景深、材质与氛围方向
7. Design Risks：容易偏离品牌的设计风险与原因
8. Must Keep：必须继承的长期品牌资产
9. Can Explore：允许创意团队探索的空间
10. Design Goal：本项目最终需要建立的品牌效果

Creative Brief 不是 Prompt，不包含对 AI 的命令、关键词堆砌、图片数量、画幅比例或任务卡。

## 逐张视觉核验

文件名、OCR、尺寸和元数据不能替代画面判断。实际查看全部图片后，应在 `masterpiece-os.json` 记录核验结果：

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

## Brand DNA Decision 配置

```json
{
  "brandDnaDecision": {
    "originalIntent": {
      "statement": "以克制东方审美连接真实日常生活。",
      "evidence": ["创始人访谈", "项目目标确认"]
    },
    "industryBenchmark": {
      "observations": ["同类品牌常依赖表面东方符号"],
      "opportunities": ["用结构、材质和真实体验建立差异"],
      "references": ["案例 A", "案例 B", "案例 C"]
    },
    "creativeDecision": {
      "statement": "以清晰结构、稳定留白与真实材质表达当代东方感。",
      "rationale": ["回应原始意图，并避开行业符号堆叠"],
      "tradeoffs": ["不使用仿古字体和装饰纹样堆叠"]
    },
    "approvedBrandDNA": {
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
    "approval": {
      "status": "approved",
      "approvedBy": "Creative Director",
      "approvedAt": "2026-07-14"
    }
  }
}
```

只有 Original Intent、Industry Benchmark、Creative Decision、九个 DNA 维度和显式批准全部完成时，DNA 才会进入 Brief。旧 `creativeReasoning.visualDNA` 只会保留为迁移候选，不会被直接升级。

Brand Identity、Brand Positioning、Design Language、Emotional Direction、Photography Direction、Design Risks、Must Keep、Can Explore 与 Design Goal 继续填写在 `creativeReasoning` 中。完整空模板见 `templates/masterpiece-os.json`。

## Thinking Framework

v3.2 的 Knowledge 保存问题，不保存项目答案或自动规则：

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
- 不把用户视觉方案直接升级为 Approved Brand DNA。
- 不生成图片、图片任务、Prompt、数量或画幅比例计划。
- 不自动修改 Knowledge、Rule 或 Template。
- 不自动执行 Git Commit、Push 或其他 Git 操作。

## GPT Collaboration

交接输入只有两项：已核验视觉方案与 `02-Creative-Brief.md`。Masterpiece-OS 在 Brief 完成后停止；GPT 在 Must Keep、Can Explore 与 Design Risks 的边界内，自主决定图片规划和生成方式。

## 开发与测试

```bash
npm test
npm run test:regression
```

更多说明见 [使用手册](docs/使用手册.md)、[架构说明](docs/架构说明.md)、[项目自动初始化](docs/项目自动初始化.md) 与 [GitHub 文件管理规范](docs/GitHub文件管理规范.md)。
