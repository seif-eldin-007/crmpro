export function normalizeLeadSourceNameForComparison(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeLeadSourceDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
