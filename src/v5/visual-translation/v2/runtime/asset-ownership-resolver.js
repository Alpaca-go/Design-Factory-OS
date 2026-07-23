const PROJECT_LOGO = /标准\s*Logo|品牌\s*Logo|项目\s*Logo|项目品牌标识|标准标志/iu;
const GROUP_LOGO = /集团\s*Logo|母集团\s*Logo|母公司\s*(?:Logo|VI)|集团\s*VI|集团视觉|母集团视觉/iu;
const PARTNER_LOGO = /合作(?:方|伙伴|品牌)\s*(?:Logo|VI)|联合品牌\s*(?:Logo|VI)/iu;
const THIRD_PARTY_LOGO = /供应商(?:品牌)?\s*(?:Logo|VI)|第三方(?:品牌)?\s*(?:Logo|VI)/iu;
const ANY_VISUAL_IDENTITY = /Logo|标志|水印|\bVI\b|视觉识别/iu;

export function resolveAssetOwnership({ text = '', fieldPath = '', projectBrandName = '', parentBrandName = '' } = {}) {
  const value = String(text);
  if (!ANY_VISUAL_IDENTITY.test(value)) return null;
  if (parentBrandName && value.includes(parentBrandName) && /Logo|\bVI\b|视觉|标志|水印/iu.test(value)) return 'parent_group';
  if (GROUP_LOGO.test(value)) return 'parent_group';
  if (PARTNER_LOGO.test(value)) return 'partner_brand';
  if (THIRD_PARTY_LOGO.test(value)) return 'third_party';
  if (projectBrandName && value.includes(projectBrandName) && /Logo|标志|\bVI\b/iu.test(value)) return 'project_brand';
  if (PROJECT_LOGO.test(value)) return 'project_brand';
  if (/brand_zone|logo_usage|core_brand_info|brand_area/iu.test(fieldPath)) return 'project_brand';
  if (/Logo|标志/iu.test(value) && /项目|本品牌|当前品牌|品牌/iu.test(value)) return 'project_brand';
  return 'unknown';
}

export function resolveAssetAuthorizationStatus(owner, groupAuthorization = 'not_confirmed') {
  if (owner === 'project_brand') return 'not_required';
  if (owner === 'parent_group' || owner === 'partner_brand' || owner === 'third_party') {
    return groupAuthorization === 'confirmed' ? 'confirmed'
      : groupAuthorization === 'forbidden' ? 'forbidden'
        : 'not_confirmed';
  }
  return 'not_confirmed';
}
