export function CatalogBadge({ level }: { level?: string | null }) {
  if (!level) return null;
  return <span className="catalogBadge">{level}</span>;
}
