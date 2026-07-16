export class ImageTaskMigrationError extends Error {
  constructor(message, jsonPath) {
    super(message);
    this.name = 'ImageTaskMigrationError';
    this.code = 'IMAGE_TASK_V1_MIGRATION_FAILED';
    this.jsonPath = jsonPath;
    this.jsonPaths = jsonPath ? [jsonPath] : [];
  }
}

function strings(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];
}

export function migrateImageTaskSpecV1ToV2(input, imageSystem) {
  const source = structuredClone(input || {});
  if (!Array.isArray(source.imageTasks)) return source;
  const approvedRules = strings(imageSystem?.consistencyRules);

  source.imageTasks = source.imageTasks.map((task, index) => {
    const next = { ...task };
    const oldPrevious = strings(task?.consistencyWithPreviousTasks);
    const existingGlobal = strings(task?.consistencyWithGlobalSystem);

    if (index === 0) {
      const globalRules = existingGlobal.length ? existingGlobal : oldPrevious.length ? oldPrevious : approvedRules;
      if (!globalRules.length) {
        throw new ImageTaskMigrationError(
          '旧版第一张图片任务没有可迁移的全局一致性规则，必须重新运行 image-task-compiler。',
          'imageTasks[0].consistencyWithGlobalSystem'
        );
      }
      next.consistencyWithGlobalSystem = globalRules;
      next.consistencyWithPreviousTasks = [];
      return next;
    }

    const globalRules = existingGlobal.length ? existingGlobal : approvedRules;
    if (!globalRules.length) {
      throw new ImageTaskMigrationError(
        `旧版第 ${index + 1} 张图片任务没有可迁移的全局一致性规则。`,
        `imageTasks[${index}].consistencyWithGlobalSystem`
      );
    }
    next.consistencyWithGlobalSystem = globalRules;
    next.consistencyWithPreviousTasks = oldPrevious;
    return next;
  });
  return source;
}
