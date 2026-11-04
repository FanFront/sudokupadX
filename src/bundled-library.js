// Pure filters for the bundled library. Keep the 100 generated 9x9
// puzzles discoverable without crowding the adventure map choices.
export const GENERATED_9X9_GROUP = 'generated-9x9';
export const SINGLE_RULE_GROUP = 'single-rule-lab';
export const ADVANCED_GROUP = 'advanced-logic';
export const PERSONAL_GROUP = 'personal-created';

export function filterBundledEntries(entries, {
  category = 'all', query = '', showLinked = false
} = {}) {
  const needle = String(query).trim().toLocaleLowerCase('zh-CN');
  return entries.filter(entry => {
    if (!showLinked && entry.kind !== 'main' && entry.kind !== 'standalone')
      return false;
    const generated = entry.group === GENERATED_9X9_GROUP;
    const single = entry.group === SINGLE_RULE_GROUP;
    const advanced = entry.group === ADVANCED_GROUP;
    const personal = entry.group === PERSONAL_GROUP;
    if (category === 'generated' && !generated) return false;
    if (category === 'single' && !single) return false;
    if (category === 'advanced' && !advanced) return false;
    if (category === 'personal' && !personal) return false;
    if (category === 'adventure' && entry.kind !== 'main') return false;
    if (category === 'other' && (generated || single || advanced || personal || entry.kind === 'main')) return false;
    if (needle && ![entry.title, entry.group, entry.id, entry.tier, entry.givens]
      .join(' ').toLocaleLowerCase('zh-CN').includes(needle)) return false;
    return true;
  });
}

export function bundledEntrySubtitle(entry) {
  if (entry.group === PERSONAL_GROUP)
    return (entry.done ? '已标记完成 · ' : '') + (entry.starred ? '★ 收藏 · ' : '') +
      '本机生成 · ' + (entry.givens ?? '—') + ' 个提示数 · ' +
      '技巧等级 ' + (entry.tier || '—') + ' / 5';
  if (entry.group === ADVANCED_GROUP)
    return '9×9 · ' + (entry.givens ?? '—') + ' 个提示数 · 认证最低技巧等级 ' +
      entry.tier + ' / 4 · 无需猜测';
  if (entry.group === SINGLE_RULE_GROUP)
    return '9×9 · ' + (entry.givens ?? '—') + ' 个提示数 · 最低技巧等级 ' +
      (entry.tier || '—') + ' / 4 · 无需猜测';
  if (entry.group === GENERATED_9X9_GROUP)
    return '生成 9×9 · 最低技巧等级 ' + (entry.tier || '—') + ' / 4 · 无需猜测';
  if (entry.kind === 'main') return '冒险地图';
  if (entry.kind === 'standalone') return '独立谜题';
  return entry.group + ' · ' + (entry.kind === 'boss' ? '首领谜题' : '支线谜题');
}
