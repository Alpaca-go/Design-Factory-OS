import type { CurrentProjectProfile, ProjectRecord } from '../shared/types.ts';

export const incompleteProjectIdentity = (value: unknown): boolean =>
  /待确认|待补充|未知|未识别|未命名|未标题/iu.test(String(value || ''));

export function resolveAnalyzedProjectIdentity(
  project: Pick<ProjectRecord, 'projectName' | 'brandName' | 'detectedProjectName' | 'detectedBrandName'>,
  rawBrandName: unknown
): { projectName: string; brandName: string } {
  const analyzedBrandName = String(rawBrandName || project.detectedBrandName || '').trim();
  return {
    brandName: !incompleteProjectIdentity(project.brandName) ? project.brandName : analyzedBrandName,
    projectName: !incompleteProjectIdentity(project.projectName)
      ? project.projectName
      : analyzedBrandName || project.detectedProjectName || project.projectName
  };
}

export function recoverPersistedProjectIdentity(
  profile: CurrentProjectProfile
): CurrentProjectProfile {
  if (!incompleteProjectIdentity(profile.brandName) && !incompleteProjectIdentity(profile.projectName)) {
    return profile;
  }
  const confirmedBrandName = profile.confirmedFacts
    .map((fact) => fact.match(/品牌(?:名称|名)?\s*(?:为|[:：])\s*([^，。；\s]+)/u)?.[1]?.trim() || '')
    .find((value) => value && !incompleteProjectIdentity(value));
  if (!confirmedBrandName) return profile;
  return {
    ...profile,
    brandName: incompleteProjectIdentity(profile.brandName) ? confirmedBrandName : profile.brandName,
    projectName: incompleteProjectIdentity(profile.projectName) ? confirmedBrandName : profile.projectName
  };
}
