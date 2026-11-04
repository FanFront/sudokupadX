// Pure filters for the bundled library. Keep the 100 generated 9x9
// puzzles discoverable without crowding the adventure map choices.
export const GENERATED_9X9_GROUP = 'generated-9x9';

export function filterBundledEntries(entries, {
  category = 'all', query = '', showLinked = false
} = {}) {
  const needle = String(query).trim().toLocaleLowerCase('zh-CN');
  return entries.filter(entry => {
    if (!showLinked && entry.kind !== 'main' && entry.kind !== 'standalone')
      return false;
    const generated = entry.group === GENERATED_9X9_GROUP;
    if (category === 'generated' && !generated) return false;
    if (category === 'adventure' && entry.kind !== 'main') return false;
    if (category === 'other' && (generated || entry.kind === 'main')) return false;
    if (needle && ![entry.title, entry.group, entry.id, entry.tier]
      .join(' ').toLocaleLowerCase('zh-CN').includes(needle)) return false;
    return true;
  });
}

export function bundledEntrySubtitle(entry) {
  if (entry.group === GENERATED_9X9_GROUP)
    return '生成 9×9 · 技巧等级 ' + (entry.tier || '—') + ' / 4 · 无需猜测';
  if (entry.kind === 'main') return '冒险地图';
  if (entry.kind === 'standalone') return '独立谜题';
  return entry.group + ' · ' + (entry.kind === 'boss' ? '首领谜题' : '支线谜题');
}
