const LIBRARY_BATCH_SEPARATOR = ",";

/**
 * 声音库多选只在本次采集/转译流程中传递，不写入项目快照。
 * 这里同时过滤异常路由值，避免把任意字符串拼回动态路径。
 */
export function parseLibrarySelection(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value
    .split(LIBRARY_BATCH_SEPARATOR)
    .map((id) => id.trim())
    .filter((id) => /^[a-zA-Z0-9_-]+$/.test(id)))];
}

export function serializeLibrarySelection(cardIds: string[]): string {
  return [...new Set(cardIds)].join(LIBRARY_BATCH_SEPARATOR);
}

export function nextSelectedCardId(cardIds: string[], currentCardId: string): string | null {
  const currentIndex = cardIds.indexOf(currentCardId);
  return currentIndex >= 0 ? cardIds[currentIndex + 1] ?? null : null;
}

export function librarySelectionProgress(cardIds: string[], currentCardId: string) {
  const currentIndex = cardIds.indexOf(currentCardId);
  return {
    index: currentIndex >= 0 ? currentIndex : 0,
    total: Math.max(cardIds.length, 1),
  };
}

export function selectedLibraryUnitIds(
  cardIds: string[],
  units: readonly { id: string; cardId: string }[],
): string[] {
  return cardIds.flatMap((cardId) => {
    const unit = units.find((item) => item.cardId === cardId);
    return unit ? [unit.id] : [];
  });
}
