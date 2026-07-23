import { extractEvidenceBoundValues } from '../visual-fact-first/evidence-bound-values.js';

const SPECIFIC_INSTITUTION = /(?:集团|公司|机构|医院|学校|协会|委员会|研究院)[\u4e00-\u9fffA-Za-z0-9]{2,}|[\u4e00-\u9fffA-Za-z0-9]{2,}(?:集团|公司|机构|医院|学校|协会|委员会|研究院)/u;
const QUALIFICATION_ID = /(?:证书|资质|许可|注册|备案|认证)(?:编号|号|代码)?\s*[:：#]?\s*[A-Z0-9-]{5,}/iu;
const REAL_ASSET = /(?:真实|官方|原始|外部|合作方|集团|供应商).{0,8}(?:Logo|标志|素材|图片|文件)/iu;

export function classifyPlaceholder(detection = {}, direction = {}) {
  const text = `${detection.detected_text || ''} ${detection.reason || ''}`;
  const mode = direction?.asset_authorization?.document_visualization_mode;
  const explicitlyStructureOnly = mode === 'structure_only' || /\bstructure_only\b|仅结构|结构占位/iu.test(text);
  const hasSpecificValue = extractEvidenceBoundValues(text).length > 0
    || SPECIFIC_INSTITUTION.test(text)
    || QUALIFICATION_ID.test(text);

  if (explicitlyStructureOnly && !hasSpecificValue && !REAL_ASSET.test(text)) {
    return 'safe_structure_placeholder';
  }
  if (/授权|集团\s*Logo|合作方|合作品牌|供应商/iu.test(text)) return 'authorization_placeholder';
  if (/Logo|标志|素材|图片|文件|资产/iu.test(text)) return 'unresolved_asset_placeholder';
  if (/数据|数值|覆盖率|比例|编号|名单|机构名|资质/iu.test(text)) return 'unresolved_data_placeholder';
  return 'unknown';
}
