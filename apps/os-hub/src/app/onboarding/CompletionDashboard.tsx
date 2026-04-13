"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "./page.module.css";

interface ClientCompletion {
  entityId: string;
  name: string;
  clientType: string;
  manager: string;
  completionPercent: number;
  docs: Record<string, boolean>;
  fields: Record<string, boolean>;
}

interface ScanProgress {
  current: number;
  total: number;
  parsed: number;
  startedAt: string | null;
  estimatedSecondsLeft: number | null;
}

interface SummaryResponse {
  total: number;
  avgCompletion: number;
  zeroDocsCount: number;
  allDocsCount: number;
  clients: ClientCompletion[];
  cached?: boolean;
  scanInProgress?: boolean;
  scanProgress?: ScanProgress | null;
  lastUpdated?: string | null;
  error?: string;
  message?: string;
}

const DOC_LABELS: Record<string, string> = {
  idCard: "ת.ז/ רישיון בעלים",
  bankApproval: "אישור ניהול חשבון",
  osekMurshe: "תעודת עוסק מורשה",
  teudatHitagdut: "תעודת התאגדות",
  takanonCompany: "תקנון חברה",
  protokolSignature: "פרוטוקול מורשה חתימה",
  nesachCompany: "נסח חברה",
  ptichaTikRashuyot: "פתיחת תיק רשויות",
};

const CLIENT_TYPE_OPTIONS = ["עוסק מורשה", "חברה בע\"מ", "עוסק פטור", "שותפות", "עמותה", "עסק זעיר"];
const MANAGER_OPTIONS = ["אבי ביטן", "רון ביטן"];

export default function CompletionDashboard() {
  const [clients, setClients] = useState<ClientCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({ total: 0, avgCompletion: 0, zeroDocsCount: 0, allDocsCount: 0 });
  const [filters, setFilters] = useState({ clientType: "", manager: "", missingDoc: "" });
  const [generatingLink, setGeneratingLink] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scanInProgress, setScanInProgress] = useState(false);
  const [scanProgressData, setScanProgressData] = useState<ScanProgress | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/completion/summary")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load data");
        return r.json();
      })
      .then((data: SummaryResponse) => {
        setClients(data.clients || []);
        setSummary({
          total: data.total || 0,
          avgCompletion: data.avgCompletion || 0,
          zeroDocsCount: data.zeroDocsCount || 0,
          allDocsCount: data.allDocsCount || 0,
        });
        setScanInProgress(data.scanInProgress || false);
        setScanProgressData(data.scanProgress || null);
        setLastUpdated(data.lastUpdated || null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredClients = clients.filter((c) => {
    if (filters.clientType && c.clientType !== filters.clientType) return false;
    if (filters.manager && c.manager !== filters.manager) return false;
    if (filters.missingDoc && c.docs[filters.missingDoc] !== false) return false;
    return true;
  });

  const handleGenerateLink = async (entityId: string, clientName: string) => {
    setGeneratingLink(entityId);
    setGeneratedUrl(null);
    try {
      const res = await fetch("/api/completion/generate-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summitEntityId: entityId, clientName }),
      });
      if (!res.ok) throw new Error("Failed to generate link");
      const data = (await res.json()) as { url: string };
      setGeneratedUrl(data.url);
    } catch {
      alert("שגיאה ביצירת קישור");
    } finally {
      setGeneratingLink(null);
    }
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleWhatsApp = (url: string, clientName: string) => {
    const message = `שלום ${clientName}!\nאנא השלם/י את המסמכים החסרים דרך הקישור הבא:\n${url}`;
    const encoded = encodeURIComponent(message);
    window.open(`https://web.whatsapp.com/send?text=${encoded}`, "_blank", "noopener,noreferrer");
  };

  const getProgressColor = (pct: number): string => {
    if (pct < 30) return "var(--status-error, #dc3545)";
    if (pct < 70) return "#f59e0b";
    return "var(--status-success, #22c55e)";
  };

  if (loading) {
    return (
      <div className={styles.completionWrapper}>
        <div className={styles.loadingBar}>
          <div className={styles.loadingBarInner} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.completionWrapper}>
        <div className={styles.generateError}>{error}</div>
      </div>
    );
  }

  return (
    <div className={styles.completionWrapper}>
      {/* Stat Cards */}
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{summary.total}</div>
          <div className={styles.statLabel}>סה&quot;כ לקוחות</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{summary.avgCompletion}%</div>
          <div className={styles.statLabel}>השלמה ממוצעת</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{summary.zeroDocsCount}</div>
          <div className={styles.statLabel}>ללא מסמכים</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{summary.allDocsCount}</div>
          <div className={styles.statLabel}>הושלם במלואו</div>
        </div>
      </div>

      {/* Scan Controls */}
      <div style={{ marginBottom: '1rem', padding: '1rem', background: '#F8F7F4', borderRadius: '10px', fontSize: '0.8rem', color: '#718096' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: scanInProgress ? '0.75rem' : 0 }}>
          <div>
            {lastUpdated && !scanInProgress && <span>עדכון אחרון: {new Date(lastUpdated).toLocaleString('he-IL')}</span>}
            {scanInProgress && scanProgressData && (
              <span style={{ color: '#1B2A4A', fontWeight: 600 }}>
                סורק {scanProgressData.current} / {scanProgressData.total} לקוחות
                {scanProgressData.parsed > 0 && ` · ${scanProgressData.parsed} תקינים`}
                {scanProgressData.estimatedSecondsLeft != null && scanProgressData.estimatedSecondsLeft > 0 && (
                  <span style={{ color: '#718096', fontWeight: 400 }}>
                    {' · '}עוד {scanProgressData.estimatedSecondsLeft > 60
                      ? `${Math.round(scanProgressData.estimatedSecondsLeft / 60)} דקות`
                      : `${scanProgressData.estimatedSecondsLeft} שניות`}
                  </span>
                )}
              </span>
            )}
            {scanInProgress && !scanProgressData && <span style={{ color: '#C5A572', fontWeight: 600 }}>⏳ מתחיל סריקה...</span>}
            {!lastUpdated && !scanInProgress && <span>אין נתונים — יש להפעיל סריקה ראשונה</span>}
          </div>
          <button
            onClick={() => {
              setScanInProgress(true);
              setScanProgressData(null);
              fetch('/api/completion/summary?scan=start')
                .then(() => {
                  // Poll every 5s for progress, load full data when done
                  const interval = setInterval(() => {
                    fetch('/api/completion/summary')
                      .then(r => r.json())
                      .then((data: SummaryResponse) => {
                        setScanProgressData(data.scanProgress || null);
                        if (!data.scanInProgress) {
                          clearInterval(interval);
                          setScanInProgress(false);
                          loadData();
                        }
                      })
                      .catch(() => clearInterval(interval));
                  }, 5000);
                })
                .catch(() => setScanInProgress(false));
            }}
            disabled={scanInProgress}
            style={{
              background: scanInProgress ? '#CBD5E0' : '#C5A572',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '0.5rem 1.25rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: scanInProgress ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {scanInProgress ? 'סורק...' : 'סרוק מסאמיט'}
          </button>
        </div>

        {/* Progress bar */}
        {scanInProgress && scanProgressData && scanProgressData.total > 0 && (
          <div style={{ background: '#E2E0DB', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
            <div style={{
              background: '#C5A572',
              height: '100%',
              width: `${Math.round((scanProgressData.current / scanProgressData.total) * 100)}%`,
              borderRadius: '4px',
              transition: 'width 0.5s ease',
            }} />
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <select
          className={styles.selectInput}
          value={filters.clientType}
          onChange={(e) => setFilters((f) => ({ ...f, clientType: e.target.value }))}
        >
          <option value="">כל סוגי הלקוחות</option>
          {CLIENT_TYPE_OPTIONS.map((ct) => (
            <option key={ct} value={ct}>{ct}</option>
          ))}
        </select>
        <select
          className={styles.selectInput}
          value={filters.manager}
          onChange={(e) => setFilters((f) => ({ ...f, manager: e.target.value }))}
        >
          <option value="">כל מנהלי התיקים</option>
          {MANAGER_OPTIONS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          className={styles.selectInput}
          value={filters.missingDoc}
          onChange={(e) => setFilters((f) => ({ ...f, missingDoc: e.target.value }))}
        >
          <option value="">כל המסמכים</option>
          {Object.entries(DOC_LABELS).map(([key, label]) => (
            <option key={key} value={key}>חסר: {label}</option>
          ))}
        </select>
      </div>

      {/* Generated Link Popup */}
      {generatedUrl && (
        <div className={styles.generatedLinkBlock}>
          <div className={styles.generatedLinkLabel}>קישור השלמה נוצר בהצלחה</div>
          <div className={styles.linkCopyRow}>
            <input
              type="text"
              className={styles.linkInput}
              value={generatedUrl}
              readOnly
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              className={`${styles.copyBtn}${copied ? ` ${styles.copied}` : ""}`}
              onClick={() => handleCopy(generatedUrl)}
            >
              {copied ? "הועתק!" : "העתק"}
            </button>
            <button
              className={styles.whatsappBtn}
              onClick={() => handleWhatsApp(generatedUrl, "")}
            >
              שלח בוואטסאפ
            </button>
            <button
              className={styles.tableCopyBtn}
              onClick={() => setGeneratedUrl(null)}
            >
              סגור
            </button>
          </div>
        </div>
      )}

      {/* Client Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.completionTable}>
          <thead>
            <tr>
              <th>שם לקוח</th>
              <th>סוג</th>
              <th>מנהל תיק</th>
              <th>השלמה %</th>
              <th>מסמכים</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((client) => (
              <tr key={client.entityId}>
                <td>{client.name}</td>
                <td className={styles.typeCell}>{client.clientType}</td>
                <td className={styles.typeCell}>{client.manager}</td>
                <td>
                  <div className={styles.progressBarWrapper}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{
                          width: `${client.completionPercent}%`,
                          backgroundColor: getProgressColor(client.completionPercent),
                        }}
                      />
                    </div>
                    <span className={styles.progressLabel}>{client.completionPercent}%</span>
                  </div>
                </td>
                <td>
                  <div className={styles.docDots}>
                    {Object.entries(client.docs).map(([key, filled]) => (
                      <span
                        key={key}
                        className={`${styles.docDot} ${filled ? styles.docDotGreen : styles.docDotRed}`}
                        title={`${DOC_LABELS[key] || key}: ${filled ? "הועלה" : "חסר"}`}
                      />
                    ))}
                  </div>
                </td>
                <td>
                  <button
                    className={styles.generateBtn}
                    style={{ padding: "0.25rem 0.75rem", fontSize: "var(--font-size-xs)" }}
                    onClick={() => handleGenerateLink(client.entityId, client.name)}
                    disabled={generatingLink === client.entityId}
                  >
                    {generatingLink === client.entityId ? "יוצר..." : "שלח קישור השלמה"}
                  </button>
                </td>
              </tr>
            ))}
            {filteredClients.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className={styles.emptyState}>לא נמצאו לקוחות תואמים</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
