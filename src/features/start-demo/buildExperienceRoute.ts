export function buildExperienceRoute(pathname: string, search: string): string {
  const normalizedSearch = search.startsWith("?") ? search.slice(1) : search;
  return normalizedSearch ? `${pathname}?${normalizedSearch}` : pathname;
}
