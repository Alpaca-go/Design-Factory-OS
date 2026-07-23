export const PHOTOGRAPHY_SUBJECT_TYPES = Object.freeze([
  'real_identifiable_institution',
  'real_anonymized_scene',
  'generated_scene',
  'interface_only',
  'object_only',
  'unknown'
]);

export function classifyPhotographySubject(direction = {}) {
  const system = direction.photography_object_system || {};
  const text = [
    ...(system.real_industry_objects || []),
    system.subject_and_background,
    system.people_product_packaging,
    ...(direction.execution_examples || []).flatMap((item) => [
      item.hero_subject, item.supporting_subjects, item.industry_content, item.prohibited_content
    ])
  ].filter(Boolean).join(' ');
  let subject_type = 'unknown';
  if (/真实[^。；]*(机构|医院|门店|学校|公司)[^。；]*(门头|名称|标识|logo|身份)|可识别[^。；]*(机构|人物|门头|标识)/iu.test(text)) {
    subject_type = 'real_identifiable_institution';
  } else if (/匿名|去标识|不可识别|虚化门头|不露出.*(?:logo|名称|身份)/iu.test(text)) {
    subject_type = 'real_anonymized_scene';
  } else if (/生成|模型示意|合成示意|虚构场景|非真实机构/iu.test(text)) {
    subject_type = 'generated_scene';
  } else if (/界面|屏幕|dashboard|ui|操作页/iu.test(text) && !/人物|场景摄影|实景/iu.test(text)) {
    subject_type = 'interface_only';
  } else if (/产品|物体|包装|器物|设备|材料|静物/iu.test(text) && !/人物|机构门头|实景/iu.test(text)) {
    subject_type = 'object_only';
  }
  return Object.freeze({
    classifier_version: 'photography-subject-classifier-v1',
    subject_type,
    institution_authorization_required: subject_type === 'real_identifiable_institution',
    evidence_excerpt: text.slice(0, 240)
  });
}

