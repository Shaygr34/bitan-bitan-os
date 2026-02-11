export const TYPE_LABELS: Record<string, string> = {
  financial: "דוחות כספיים",
  annual: "דוחות שנתיים",
};

export const FILE_ROLE_LABELS: Record<string, string> = {
  idom_upload: "קובץ IDOM (קלט)",
  sumit_upload: "קובץ SUMIT (קלט)",
  import_output: "קובץ ייבוא (פלט)",
  diff_report: 'דו"ח שינויים',
  exceptions_report: 'דו"ח חריגים',
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString("he-IL");
}
