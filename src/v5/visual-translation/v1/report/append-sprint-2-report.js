import { validateSprint2Checkpoint } from '../runtime/sprint-2-checkpoint-store.js';
import { validateSprint2RuntimeCheckpoint } from '../runtime/sprint-2-runtime-checkpoint-store.js';
import { VISUAL_TRANSLATION_SPRINT_2A } from '../protocol/sprint-2-stage-registry.js';

const START_MARKER = '<!-- masterpiece-os:sprint-2-report-append:start -->';
const END_MARKER = '<!-- masterpiece-os:sprint-2-report-append:end -->';

export function compileSprint2ReportAppend(checkpoint) {
  const value = normalizeCheckpoint(checkpoint);
  const anchor = value.anchor_direction;
  const dnaUnits = [...value.visual_dna.primary_dna, ...value.visual_dna.supporting_dna];
  const grammarRows = Object.entries(value.visual_grammar).map(([name, grammar]) => `| ${name} | ${summarizeRules(grammar.allowed)} | ${summarizeRules(grammar.preferred)} | ${summarizeRules(grammar.avoid)} | ${grammar.anchor_inheritance.anchor_ids.join('、')} |`).join('\n');
  const consistencyRows = Object.entries(value.consistency_rules).flatMap(([group, rules]) => rules.map((rule) => `| ${group} | ${rule.rule_id} | ${escapeCell(rule.statement)} | ${escapeCell(rule.observable_condition)} | ${rule.maps_to.map((item) => `${item.type}:${item.id}`).join('、')} |`)).join('\n');
  const append = `${START_MARKER}
> Sprint 2 Append Version: ${VISUAL_TRANSLATION_SPRINT_2A.reportAppendVersion}<br>
> Sprint 2 Checkpoint: ${value.checkpoint_version}<br>
> Source Hash: ${value.source_hash}<br>
> Status: ${value.status}

## S2.1 Anchor Direction

### ${anchor.anchor_id} · ${anchor.name}

${anchor.core_visual_proposition}

- Anchor Type：${anchor.anchor_type}
- Primary Anchor：${anchor.primary_anchor.name} — ${anchor.primary_anchor.mechanism}
- Supporting Anchors：${anchor.supporting_anchors.map((item) => `${item.name} — ${item.mechanism}`).join('；') || '无'}
- Anchor Mechanism：${anchor.anchor_mechanism.relationship}；${anchor.anchor_mechanism.behavior}
- Visual Role：${anchor.visual_role}
- Evidence：${anchor.evidence_ids.join('、')}
- Reason Basis：${anchor.reason_basis} / ${anchor.evidence_confidence}

**Inclusion Boundary**

${boundaryList(anchor.inclusion_boundary)}

**Exclusion Boundary**

${boundaryList(anchor.exclusion_boundary)}

## S2.2 Visual DNA

| 层级 | ID | 名称 | 视觉形式 | 功能角色 | Anchor 关系 |
|---|---|---|---|---|---|
${dnaUnits.map((unit) => `| ${value.visual_dna.primary_dna.includes(unit) ? 'Primary' : 'Supporting'} | ${unit.dna_id} | ${escapeCell(unit.name)} | ${unit.visual_form.category}：${escapeCell(unit.visual_form.description)} | ${escapeCell(unit.functional_role)} | ${unit.anchor_relation.anchor_id} |`).join('\n')}

**Forbidden Mutations**

${list(value.visual_dna.forbidden_mutations)}

## S2.3 Visual Grammar

| Grammar | Allowed | Preferred | Avoid | Anchor Inheritance |
|---|---|---|---|---|
${grammarRows}

## S2.4 Consistency Rules

| 分组 | Rule ID | 规则 | 可观察条件 | 映射 |
|---|---|---|---|---|
${consistencyRows}

## S2.5 Generation Boundary

- Mandatory Prompt Inputs：${value.generation_boundary.mandatory_prompt_inputs.join('、')}
- Optional Prompt Inputs：${value.generation_boundary.optional_prompt_inputs.join('、') || '无'}
- Negative Constraints：${value.generation_boundary.negative_constraints.join('；')}
- Human-only Decisions：${value.generation_boundary.human_only_decisions.join('；')}
- Deferred to Sprint 3：${value.generation_boundary.deferred_to_sprint3.join('；')}
- Executable Assets：${value.generation_boundary.executable_assets.join('、') || '无'}
- Non-executable Assets：${value.generation_boundary.non_executable_assets.join('、') || '无'}

${END_MARKER}`;
  return `${append.trim()}\n`;
}

export function appendSprint2Report(sprint1Markdown, checkpoint) {
  if (typeof sprint1Markdown !== 'string' || !sprint1Markdown.trim()) throw new TypeError('Sprint 1 report Markdown is required');
  if (sprint1Markdown.includes(START_MARKER) || sprint1Markdown.includes(END_MARKER)) throw new Error('Sprint 2 report append already exists');
  const separator = sprint1Markdown.endsWith('\n') ? '\n' : '\n\n';
  return `${sprint1Markdown}${separator}${compileSprint2ReportAppend(checkpoint)}`;
}

function boundaryList(items) {
  return items.map((item) => `- ${item.rule}（验证：${item.observable_condition}）`).join('\n');
}

function summarizeRules(items) {
  return items.map((item) => `${escapeCell(item.rule)}〔${escapeCell(item.observable_condition)}〕`).join('<br>');
}

function list(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\s*\n\s*/gu, '<br>');
}

export const SPRINT_2_REPORT_APPEND_MARKERS = Object.freeze({ start: START_MARKER, end: END_MARKER });

function normalizeCheckpoint(checkpoint) {
  if (checkpoint?.checkpoint_version === VISUAL_TRANSLATION_SPRINT_2A.runtimeCheckpointVersion) {
    const runtime = validateSprint2RuntimeCheckpoint(checkpoint);
    if (runtime.status !== 'completed' || !runtime.confirmed_anchor || !runtime.visual_dna || !runtime.consistency_rules || !runtime.generation_boundary) {
      throw new Error('Sprint 2 Runtime checkpoint must be completed before report append');
    }
    return { ...runtime, anchor_direction: runtime.confirmed_anchor };
  }
  return validateSprint2Checkpoint(checkpoint);
}
