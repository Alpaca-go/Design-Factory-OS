export function mergeEvidenceBatches(maps) {
  const evidence = [];
  const seen = new Map();
  const idMap = new Map();
  for (const map of maps) {
    for (const item of map.evidence) {
      const key = `${item.sourceId}:${item.chunkId}:${item.statement.replace(/\s+/g, '')}`;
      let target = seen.get(key);
      if (!target) {
        target = { ...item, evidenceId: `evidence-${String(evidence.length + 1).padStart(4, '0')}` };
        evidence.push(target);
        seen.set(key, target);
      }
      idMap.set(`${maps.indexOf(map)}:${item.evidenceId}`, target.evidenceId);
    }
  }
  const conflicts = maps.flatMap((map, mapIndex) => map.conflicts.map((item) => ({
    ...item,
    evidenceIds: item.evidenceIds.map((id) => idMap.get(`${mapIndex}:${id}`)).filter(Boolean)
  }))).filter((item) => item.evidenceIds.length);
  const missingInformation = [];
  const missingTopics = new Set();
  for (const item of maps.flatMap((map) => map.missingInformation)) {
    if (missingTopics.has(item.topic)) continue;
    missingTopics.add(item.topic);
    missingInformation.push({ ...item, missingId: `missing-${missingInformation.length + 1}` });
  }
  return { evidence, conflicts: conflicts.map((item, index) => ({ ...item, conflictId: `conflict-${index + 1}` })), missingInformation };
}
