/**
 * Format SQLite datetime string to local time string.
 * SQLite stores datetimes as "YYYY-MM-DD HH:MM:SS" in local time.
 * JS's Date constructor treats "YYYY-MM-DD..." as UTC, which adds timezone offset.
 * We replace "-" with "/" to force local-time parsing.
 */
export function formatDateTime(s: string | undefined): string {
  if (!s) return '';
  try {
    const d = new Date(s.replace(/-/g, '/'));
    return d.toLocaleString();
  } catch {
    return s;
  }
}

export function formatDate(s: string | undefined): string {
  if (!s) return '';
  try {
    const d = new Date(s.replace(/-/g, '/'));
    return d.toLocaleDateString();
  } catch {
    return s;
  }
}
