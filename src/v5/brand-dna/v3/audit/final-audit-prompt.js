export const FINAL_AUDIT_PROMPT_VERSION = 'final-brand-dna-audit-prompt-v3.6';

export function buildFinalAuditPrompt(core, visual, compiledImageTasks, options = {}) {
  const stageId = options.recheck ? '07-final-audit-recheck' : '07-final-audit';
  const payload = { decision: core.decision, visualSystemTaskPlan: visual, compiledImageTasks };
  const recheckContext = options.recheck ? `
这是受限修复后的唯一复审。原问题：${JSON.stringify(options.previousIssues || [])}
必须重新检查完整对象，不得仅凭已修补就判定 pass。` : '';
  return [{ role: 'user', content: `PROTOCOL_STAGE=${stageId}
PROMPT_VERSION=${FINAL_AUDIT_PROMPT_VERSION}
你是独立最终审计器。检查项目识别、证据边界、Functional/Capability 区分、创意命题统一性、视觉专属性、Logo/认证/Text Policy、任务重复、Prompt 可执行性和跨字段冲突。不得重生成任何对象，只返回精确问题 Path 和允许修复路径。无证据最高级、Logo/认证伪造、任务职责重复或 Prompt 与禁止项冲突均不得 pass。

审计规则：
1. 所有 path 和 allowedRepairPaths 必须以 /decision、/visualSystemTaskPlan 或 /compiledImageTasks 开头，并严格指向下方统一 JSON 对象中的真实字段；不得使用章节标题或展示名称作为路径。
2. decision.diagnosis 已明确记录的冲突、缺失和风险是合格的风险披露，不得把“存在冲突”本身再次判为跨字段缺陷；只有遗漏、掩盖或与证据相反时才报错。
3. Cultural Gene 的 maturity=declared 且 confidence=medium 是允许的；creativeThesis.coverage.differentiation 是命题差异化维度，不要求存在名为 differentiation 的 Gene。
4. textPolicy.mode=no-text 表示不得渲染可读文字、数字或标签，但允许无文字的抽象符号、图形化 UI 占位和纯视觉交互；服务场景不需要靠界面文字证明真实性。Prompt 中明确禁止 readable text 是对 no-text 的强化，不是冲突。
5. 资料中提到 GSP 等资质，只能支持能力事实，不能据此生成认证标识或证书图形；没有锁定的认证图形资产时，prohibitedClaims 中禁止认证标识生成是正确边界。
6. Capability Gene 应描述稳定交付所依赖的系统、网络、资源、资产、资质、技术与组织能力；这些内容不得被误判为 Functional Gene。Functional Gene 描述客户最终获得的结果。
7. no-text 只禁止最终画面渲染可读文字、数字和标签，不禁止 Prompt 使用画幅比例、相机焦距、运动频率、色温、尺寸或构图比例等制作参数；只有 display、reads、label、text 等语义明确要求把数值画进画面时，才属于可读数字违规。
8. Evidence Map 的 statement 或 quote 明确包含某项事实，就表示该事实已锁定为“原资料中的声明”；pendingConfirmations 表示公开传播前仍需外部核验，不等于 Evidence Map 缺证。把这类未外部核验的数字列入 generationBoundary.prohibitedClaims 是正确的安全保护，绝不能因为“禁令存在”而报错，也不得建议删除禁令。
9. Relational Gene 描述品牌在利益相关者之间建立的连接、协同、伙伴或生态关系角色；即使句子出现“平台”，只要核心语义是连接上下游与关系整合，就可以是 relational。不得仅凭“平台”名词把它改判为 capability。
只返回 JSON。${recheckContext}

待审计统一对象：${JSON.stringify(payload)}

输出：{"finalAudit":{"status":"pass|needs-patch|fail","score":0,"dimensions":{"identityAccuracy":0,"evidenceBoundary":0,"strategicDepth":0,"geneDistinctiveness":0,"thesisCoverage":0,"visualDistinctiveness":0,"taskExecutability":0,"crossFieldConsistency":0},"issues":[{"issueId":"issue-N","severity":"critical|major|minor","path":"/compiledImageTasks/0/finalPrompt","reason":"string","allowedRepairPaths":["/compiledImageTasks/0/finalPrompt"]}]}}` }];
}
