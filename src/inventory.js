import fs from 'node:fs/promises';
import path from 'node:path';
import { IMAGE_EXTENSIONS, relativePortable } from './utils.js';
import { parseFile } from './parsers.js';

const TYPE_NAMES = {
  '.zip': 'ZIP 压缩包', '.pdf': 'PDF 文档', '.ppt': 'PPT 演示文稿', '.pptx': 'PPT 演示文稿',
  '.potx': 'PPT 模板', '.ppsx': 'PPT 放映文件', '.png': '图片', '.jpg': '图片', '.jpeg': '图片',
  '.gif': '图片', '.webp': '图片', '.svg': '矢量图片', '.bmp': '图片', '.md': '文本', '.txt': '文本',
  '.json': '数据', '.csv': '数据'
};

async function walk(root, current, output, ignores, ignorePaths) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  for (const entry of entries) {
    if (ignores.has(entry.name)) continue;
    const full = path.join(current, entry.name);
    if (ignorePaths.has(path.resolve(full))) continue;
    if (entry.isDirectory()) await walk(root, full, output, ignores, ignorePaths);
    else if (entry.isFile()) output.push(full);
  }
}

export async function inventoryProject(root, options = {}) {
  const resolved = path.resolve(root);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`素材目录不存在：${resolved}`);
  const files = [];
  await walk(
    resolved,
    resolved,
    files,
    new Set(['.git', 'node_modules', ...(options.ignore || [])]),
    new Set((options.ignorePaths || []).map((x) => path.resolve(x)))
  );
  const items = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const stat = await fs.stat(file);
    let detail = {};
    let warning = null;
    try { detail = await parseFile(file, ext); }
    catch (error) { warning = error.message; }
    items.push({
      path: relativePortable(resolved, file), name: path.basename(file), extension: ext || '—',
      type: TYPE_NAMES[ext] || '其他', bytes: stat.size, isImage: IMAGE_EXTENSIONS.has(ext), detail, warning
    });
  }
  const byType = {};
  for (const item of items) byType[item.type] = (byType[item.type] || 0) + 1;
  return {
    root: resolved, totalFiles: items.length, totalBytes: items.reduce((sum, x) => sum + x.bytes, 0),
    imageCount: items.filter((x) => x.isImage).length, byType, items
  };
}
