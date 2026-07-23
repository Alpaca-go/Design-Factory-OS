import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveProjectName, detectIntakeIdentity } from '../src/main/project-intake.ts';

test('project name follows ZIP, folder, common prefix, then timestamp priority', () => {
  assert.deepEqual(deriveProjectName([
    { sourcePath: 'C:/方案/九州美学.zip', isDirectory: false },
    { sourcePath: 'C:/方案/其他-01.png', isDirectory: false }
  ]), { projectName: '九州美学', projectNameSource: 'uploaded-archive-name' });

  assert.deepEqual(deriveProjectName([
    { sourcePath: 'C:/方案/名济堂视觉方案', isDirectory: true }
  ]), { projectName: '名济堂', projectNameSource: 'uploaded-folder-name' });

  assert.deepEqual(deriveProjectName([
    { sourcePath: 'C:/方案/蛙耶-01.png', isDirectory: false },
    { sourcePath: 'C:/方案/蛙耶-02.pdf', isDirectory: false }
  ]), { projectName: '蛙耶', projectNameSource: 'common-file-prefix' });

  assert.deepEqual(deriveProjectName([
    { sourcePath: 'C:/方案/A.png', isDirectory: false },
    { sourcePath: 'C:/方案/B.pdf', isDirectory: false }
  ], new Date(2026, 6, 16, 9, 8, 7)), {
    projectName: '视觉项目-20260716-090807',
    projectNameSource: 'fallback-datetime'
  });

  assert.deepEqual(deriveProjectName([
    { sourcePath: 'C:/方案/input.zip', isDirectory: false }
  ], new Date(2026, 6, 16, 9, 8, 7)), {
    projectName: '视觉项目-20260716-090807',
    projectNameSource: 'fallback-datetime'
  });
});

test('brand and industry clues are inferred conservatively from intake labels', () => {
  const identity = detectIntakeIdentity(
    [{ sourcePath: 'C:/方案/九州美学视觉方案.zip', isDirectory: false }],
    ['九州美学视觉方案.zip', '医学美学品牌手册.pdf']
  );
  assert.equal(identity.detectedBrandName, '九州美学');
  assert.equal(identity.detectedIndustry, '医学美学 / 医疗健康');
  assert.ok(identity.factConfidence.industry >= 0.75);

  const uncertain = detectIntakeIdentity(
    [{ sourcePath: 'C:/方案/Alpha-01.png', isDirectory: false }],
    ['Alpha-01.png']
  );
  assert.match(uncertain.detectedIndustry, /待确认/);
  assert.equal(uncertain.factConfidence.industry, 0);
});
