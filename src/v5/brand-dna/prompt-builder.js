const OUTPUT_CONTRACT = `{
  "projectName": BrandFact,
  "brandName": BrandFact,
  "category": BrandFact,
  "businessModel": BrandFact,
  "developmentStage": BrandFact,
  "audience": {
    "primary": BrandFact[], "secondary": BrandFact[], "needs": BrandFact[],
    "barriers": BrandFact[], "usageScenarios": BrandFact[]
  },
  "strategy": {
    "purpose": BrandFact, "positioning": BrandFact, "brandPromise": BrandFact,
    "differentiators": BrandFact[], "valueProposition": BrandFact[], "brandValues": BrandFact[]
  },
  "personality": {
    "traits": BrandFact[], "relationshipRole": BrandFact,
    "toneOfVoice": BrandFact[], "emotionalOutcome": BrandFact[]
  },
  "culture": {
    "culturalContext": BrandFact[], "symbolicAssets": BrandFact[], "narrativeThemes": BrandFact[]
  },
  "boundaries": {
    "prohibitedClaims": BrandFact[], "prohibitedStyles": BrandFact[], "complianceRisks": BrandFact[]
  },
  "genes": [
    { "type": "functional|emotional|cultural|relational|behavioral|aesthetic|differentiation",
      "statement": "string", "evidence": EvidenceReference[], "confidence": "high|medium|low" }
  ],
  "oneSentenceDna": "string",
  "diagnosis": {
    "conflicts": string[], "missingInformation": string[],
    "genericStatements": string[], "strategicRisks": string[]
  },
  "creativeTranslation": {
    "creativeThesis": "string",
    "visualPersonality": string[], "visualKeywords": string[], "emotionalTemperature": string[],
    "colorDirection": CreativeDirectionItem[], "typographyDirection": CreativeDirectionItem[],
    "graphicDirection": CreativeDirectionItem[], "compositionDirection": CreativeDirectionItem[],
    "photographyDirection": CreativeDirectionItem[], "illustrationDirection": CreativeDirectionItem[],
    "materialDirection": CreativeDirectionItem[], "lightingDirection": CreativeDirectionItem[],
    "motionDirection": CreativeDirectionItem[], "suggestedAssets": string[],
    "avoidDirections": string[], "generationPlan": GenerationTask[]
  }
}

BrandFact = {
  "value": "string",
  "status": "confirmed|inferred|suggested|conflicting|missing",
  "confidence": "high|medium|low",
  "evidence": EvidenceReference[],
  "note": "optional string"
}

EvidenceReference = {
  "documentId": "必须对应语料中的文档 ID",
  "filename": "来源文件名",
  "section": "optional string",
  "page": "optional positive integer",
  "excerpt": "optional short excerpt"
}

CreativeDirectionItem = {
  "direction": "具体方向",
  "rationale": "来自哪条品牌 DNA",
  "actions": ["可观察、可执行的视觉动作"]
}

GenerationTask = {
  "id": "task-N",
  "title": "string",
  "role": "anchor-image|brand-poster|product-scene|packaging-concept|visual-system|detail-craft|application-scene",
  "objective": "图片职责",
  "requiredElements": string[],
  "optionalElements": string[],
  "prohibitedElements": string[],
  "composition": "string",
  "colorAndLighting": "string",
  "materialAndTexture": "string",
  "textPolicy": "string",
  "prompt": "可直接交给 GPT 生图的中文 Prompt"
}`;

const SYSTEM_PROMPT = `你是品牌战略顾问、品牌研究员、创意总监和视觉转译专家。

你的任务是从用户提供的品牌策划、定位、产品、用户研究等文档中建立可追溯的 Brand DNA，并将战略转译为唯一、可执行的视觉创意方向与 GPT 生图任务。

证据纪律：
- confirmed 只能用于文档明确表达且没有冲突的信息。
- inferred 必须由多个事实合理推导，不能伪装成原文事实。
- suggested 是你的优化建议，不是项目既有事实。
- conflicting 用于文档或章节之间互相矛盾的信息，不得自行选择一方。
- missing 用于完成判断所需但材料未提供的信息。
- 不得编造市场份额、竞品数据、消费者调研、创始人故事、产品功能、认证、医疗/金融/地产合规事实。
- 没有 Logo 或既有视觉资产时，不得假装已有 Logo、主色、包装或视觉系统。

创意纪律：
- 只输出一个核心创意命题，不提供多套方向让用户投票。
- “高端、年轻、专业、国际化、有温度、有质感”等词必须转译为构图、色彩、图形、字体、材质、光线、摄影、插画或动态动作。
- 生图规划必须明确 Locked Facts、Known Assets、Creative Freedom、Negative Constraints、Text Policy 和每张图的职责。
- 未提供 Logo 时，Prompt 必须禁止伪造正式 Logo 和不可控品牌文字，只能预留后期排版区域。

只输出严格 JSON，不要 Markdown，不要代码围栏，不要解释。`;

export function buildBrandDnaPrompt(corpus, options = {}) {
  const projectHint = String(options.projectNameHint || '暂未确认');
  const userPrompt = `## 任务

读取全部文档语料，完成：
1. 提取项目事实并区分 confirmed / inferred / suggested / conflicting / missing。
2. 建立目标人群、品牌战略、人格、文化与边界。
3. 形成七类品牌基因和一句话品牌 DNA。
4. 诊断定位过宽、差异化空泛、用户画像单薄、人格冲突、文档冲突、缺失信息和合规风险。
5. 输出唯一创意命题，将品牌战略转译为具体视觉语言。
6. 规划 4～8 张 GPT 生图任务，默认从 Anchor Image 开始。

本地临时项目名：${projectHint}
如果该名称是“最终版、品牌策划案、document、input”等通用文件名，不得作为最终项目名称。无法确认时 projectName.value 写“暂未确认”，status 写 missing。

## 输出 JSON Schema

${OUTPUT_CONTRACT}

## 文档语料

${corpus.mergedText}`;
  return Object.freeze({
    messages: Object.freeze([
      Object.freeze({ role: 'system', content: SYSTEM_PROMPT }),
      Object.freeze({ role: 'user', content: userPrompt })
    ]),
    corpusDigestInput: corpus.mergedText
  });
}

export function buildBrandDnaRepairPrompt(originalPrompt, invalidOutput, validationError) {
  return Object.freeze({
    messages: Object.freeze([
      originalPrompt.messages[0],
      Object.freeze({
        role: 'user',
        content: `${originalPrompt.messages[1].content}

---

上一次输出未通过 Schema 校验。
错误：${validationError}

无效输出：
${String(invalidOutput).slice(0, 40_000)}

请只返回修复后的完整 JSON 对象。不得省略字段，不要 Markdown 代码围栏。`
      })
    ])
  });
}
