import { buildStagePrompt } from './shared.js';

export function buildAuditPrompt(packageToAudit) {
  return buildStagePrompt(
    'quality-auditor',
    `作为独立审计器检查项目识别、事实与建议边界、DNA 区分度、战略到视觉因果、创意命题覆盖、视觉专属性、虚构资产、任务职责重复、文字与 Logo 政策、技术参数、医疗合规和生图可执行性。严格按 100 分制评分。
以下任一出现不得超过 90 分，并应进入 hardFailures：项目名错误；Logo 或认证资产伪造；Text Policy 冲突；Gene ID 无定义；Functional 与 Capability 高度重复；明显色温/光线知识错误；Prompt 与禁止项冲突；专属视觉资产缺失；创意命题遗漏平台关系价值。
评分权重：项目识别与事实边界15，证据15，战略15，DNA10，诊断10，创意命题10，视觉专属性10，图片执行10，跨字段与技术正确性5。`,
    packageToAudit,
    `{"qualityAudit":{"passed":true,"totalScore":0,"dimensionScores":{"projectIdentityAndBoundaries":0,"evidence":0,"strategy":0,"brandDna":0,"diagnosis":0,"creativeThesis":0,"visualSpecificity":0,"imageExecution":0,"crossFieldTechnical":0},"hardFailures":["string"],"repairInstructions":["string"]}}
阈值：totalScore>=85，projectIdentityAndBoundaries>=13/15，evidence>=13/15，strategy>=13/15，imageExecution>=9/10，crossFieldTechnical>=4/5，且 hardFailures 为空。`
  );
}

export function buildTargetedRepairPrompt(editablePackage, audit) {
  return buildStagePrompt(
    'targeted-repair',
    `只按审计器 repairInstructions 修复失败字段。返回差异补丁，不得重写或返回完整对象。
每个 operation 只能使用 replace，path 必须指向 editablePackage 中现有的叶子字段或短原始值数组。
path 必须直接以 /brandDna、/creativeThesisDecision、/visualTranslation、/imageSystem 或 /imageTasks 开头，不得添加 /editablePackage 前缀。
不得替换整个 brandDna、creativeThesisDecision、visualTranslation、imageSystem、imageTasks 或单个完整任务。
不得修改任何 id、sequence、evidence、evidenceIds、sourceRefs、lockedFacts、knownAssets、systemId。
不改变已有确认事实，不引入新业务事实，不增加第二套创意命题。每条 repairInstruction 只做必要的最小修改。`,
    { editablePackage, audit },
    '{"stageId":"targeted-repair","operations":[{"op":"replace","path":"/imageTasks/0/finalPrompt","value":"修复后的叶子字段值"}]}'
  );
}
