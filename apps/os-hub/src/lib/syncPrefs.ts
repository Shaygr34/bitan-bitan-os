const STORAGE_KEY = "bb-sync-prefs";

export interface SyncPrefs {
  defaultYear: number;
  defaultReportType: "financial" | "annual";
  defaultNotes: string;
}

const DEFAULTS: SyncPrefs = {
  defaultYear: new Date().getFullYear(),
  defaultReportType: "financial",
  defaultNotes: "",
};

export function loadSyncPrefs(): SyncPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveSyncPrefs(prefs: SyncPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function clearSyncPrefs(): void {
  localStorage.removeItem(STORAGE_KEY);
}
