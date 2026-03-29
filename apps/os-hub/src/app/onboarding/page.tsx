"use client";

import { Fragment, useEffect, useState, useRef, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { relativeTime } from "@/lib/formatters";
import styles from "./page.module.css";

interface IntakeToken {
  token: string;
  status: string;
  clientName?: string;
  _createdAt: string;
  summitEntityId?: string;
  submittedData?: string;
  prefillData?: string;
}

const CLIENT_TYPES = [
  "עוסק מורשה",
  "עוסק פטור",
  "חברה בע\"מ",
  "שותפות",
  "עסק זעיר",
  "עמותה",
  "החזר מס",
];

const FIELD_LABELS: Record<string, string> = {
  clientName: "שם לקוח",
  clientType: "סוג לקוח",
  manager: "מנהל תיק",
  businessName: "שם עסק",
  businessId: "ח.פ / ת.ז",
  email: "דוא\"ל",
  phone: "טלפון",
  address: "כתובת",
  contactName: "איש קשר",
  notes: "הערות",
};

export default function OnboardingPage() {
  const [clientName, setClientName] = useState("");
  const [clientType, setClientType] = useState("");
  const [manager, setManager] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [tokens, setTokens] = useState<IntakeToken[]>([]);
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);

  // Internal fields state per token
  const [internalFields, setInternalFields] = useState<Record<string, Record<string, string>>>({});
  const [savingInternal, setSavingInternal] = useState<string | null>(null);
  const [internalSaveMsg, setInternalSaveMsg] = useState<Record<string, string>>({});

  const linkInputRef = useRef<HTMLInputElement>(null);

  const loadTokens = useCallback(() => {
    fetch("/api/intake/tokens")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => setTokens(Array.isArray(data) ? data : []))
      .catch(() => setTokens([]))
      .finally(() => setTokensLoaded(true));
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    setGeneratedUrl(null);
    setCopied(false);

    try {
      const res = await fetch("/api/intake/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: clientName.trim() || undefined,
          clientType: clientType || undefined,
          manager: manager.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "שגיאה ביצירת קישור");
      }

      const data = (await res.json()) as { url: string };
      setGeneratedUrl(data.url);
      loadTokens();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "שגיאה לא צפויה");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyLink = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCopyToken = (url: string, tokenKey: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(tokenKey);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  };

  const getTokenUrl = (token: string) => `https://bitancpa.com/intake/${token}`;

  const toggleExpand = (token: string) => {
    setExpandedToken((prev) => (prev === token ? null : token));
  };

  const parseSubmittedData = (raw?: string): Record<string, string> | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return null;
    }
  };

  const parseFiles = (submitted: Record<string, string>): Array<{ name?: string; url?: string }> => {
    try {
      const files = JSON.parse(String(submitted.files || "[]"));
      return Array.isArray(files) ? files : [];
    } catch {
      return [];
    }
  };

  const getInternalField = (token: string, field: string) => {
    return internalFields[token]?.[field] ?? "";
  };

  const setInternalField = (token: string, field: string, value: string) => {
    setInternalFields((prev) => ({
      ...prev,
      [token]: { ...(prev[token] || {}), [field]: value },
    }));
  };

  const handleSaveInternal = async (t: IntakeToken) => {
    if (!t.summitEntityId) return;
    setSavingInternal(t.token);
    setInternalSaveMsg((prev) => ({ ...prev, [t.token]: "" }));

    const fields = internalFields[t.token] || {};
    // Filter out empty fields
    const properties: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v.trim()) properties[k] = v.trim();
    }

    if (Object.keys(properties).length === 0) {
      setInternalSaveMsg((prev) => ({ ...prev, [t.token]: "אין שדות לשמור" }));
      setSavingInternal(null);
      return;
    }

    try {
      const res = await fetch("/api/intake/update-internal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summitEntityId: Number(t.summitEntityId),
          folder: 0,
          properties,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "שגיאה בשמירה");
      }

      setInternalSaveMsg((prev) => ({ ...prev, [t.token]: "נשמר בהצלחה!" }));
      setTimeout(() => {
        setInternalSaveMsg((prev) => ({ ...prev, [t.token]: "" }));
      }, 3000);
    } catch (err) {
      setInternalSaveMsg((prev) => ({
        ...prev,
        [t.token]: err instanceof Error ? err.message : "שגיאה",
      }));
    } finally {
      setSavingInternal(null);
    }
  };

  return (
    <div className="animate-page">
      <PageHeader
        title="קליטת לקוחות"
        description="יצירת קישורי קליטה ללקוחות חדשים"
      />

      {/* Generate Section */}
      <section className={styles.generateSection}>
        <h2 className={styles.sectionTitle}>יצירת קישור חדש</h2>
        <div className={styles.goldSeparator} />

        <div className={styles.generateCard}>
          <div className={styles.formGrid}>
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel} htmlFor="clientName">
                שם לקוח (לזיהוי)
              </label>
              <input
                id="clientName"
                type="text"
                className={styles.textInput}
                placeholder="לדוגמה: ישראל ישראלי"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !generating) handleGenerate();
                }}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel} htmlFor="clientType">
                סוג לקוח
              </label>
              <select
                id="clientType"
                className={styles.selectInput}
                value={clientType}
                onChange={(e) => setClientType(e.target.value)}
              >
                <option value="">— בחר סוג —</option>
                {CLIENT_TYPES.map((ct) => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel} htmlFor="manager">
                מנהל תיק
              </label>
              <input
                id="manager"
                type="text"
                className={styles.textInput}
                placeholder="שם מנהל/ת התיק"
                value={manager}
                onChange={(e) => setManager(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.generateBtnRow}>
            <button
              className={styles.generateBtn}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? "יוצר..." : "צור קישור"}
            </button>
          </div>

          {generateError && (
            <div className={styles.generateError}>{generateError}</div>
          )}

          {generatedUrl && (
            <div className={styles.generatedLinkBlock}>
              <div className={styles.generatedLinkLabel}>קישור נוצר בהצלחה</div>
              <div className={styles.linkCopyRow}>
                <input
                  ref={linkInputRef}
                  type="text"
                  className={styles.linkInput}
                  value={generatedUrl}
                  readOnly
                  onClick={() => linkInputRef.current?.select()}
                />
                <button
                  className={`${styles.copyBtn}${copied ? ` ${styles.copied}` : ""}`}
                  onClick={handleCopyLink}
                >
                  {copied ? "הועתק!" : "העתק"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Recent Tokens Table */}
      <section className={styles.tokensSection}>
        <h2 className={styles.sectionTitle}>קישורים אחרונים</h2>
        <div className={styles.goldSeparator} />

        {!tokensLoaded ? (
          <div className={styles.loadingBar}>
            <div className={styles.loadingBarInner} />
          </div>
        ) : tokens.length === 0 ? (
          <div className={styles.emptyState}>אין קישורים עדיין</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.tokensTable}>
              <thead>
                <tr>
                  <th>שם לקוח</th>
                  <th>סוג</th>
                  <th>סטטוס</th>
                  <th>תאריך יצירה</th>
                  <th>קישור</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => {
                  const tokenUrl = getTokenUrl(t.token);
                  const isCopied = copiedToken === t.token;
                  const isExpanded = expandedToken === t.token;
                  const submitted = parseSubmittedData(t.submittedData);
                  const prefill = parseSubmittedData(t.prefillData);
                  const clientTypeFromPrefill = prefill?.clientType as string | undefined;
                  const hasDetails = t.status === "completed" && submitted;

                  return (
                    <Fragment key={t.token}>
                      <tr
                        className={isExpanded ? styles.expandedRow : undefined}
                        onClick={() => hasDetails && toggleExpand(t.token)}
                        style={hasDetails ? { cursor: "pointer" } : undefined}
                      >
                        <td>{t.clientName ?? <span style={{ color: "var(--text-caption)" }}>—</span>}</td>
                        <td className={styles.typeCell}>{clientTypeFromPrefill ?? <span style={{ color: "var(--text-caption)" }}>—</span>}</td>
                        <td>
                          <StatusBadge status={t.status} />
                        </td>
                        <td className={styles.dateCell}>{relativeTime(t._createdAt)}</td>
                        <td>
                          <button
                            className={`${styles.tableCopyBtn}${isCopied ? ` ${styles.copied}` : ""}`}
                            onClick={(e) => { e.stopPropagation(); handleCopyToken(tokenUrl, t.token); }}
                          >
                            {isCopied ? "הועתק!" : "העתק קישור"}
                          </button>
                        </td>
                        <td>
                          {hasDetails && (
                            <button
                              className={styles.expandBtn}
                              onClick={(e) => { e.stopPropagation(); toggleExpand(t.token); }}
                              aria-label={isExpanded ? "סגור פרטים" : "הצג פרטים"}
                            >
                              {isExpanded ? "▲" : "▼"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && hasDetails && submitted && (
                        <tr className={styles.detailRow}>
                          <td colSpan={6}>
                            <div className={styles.detailContent}>
                              {/* Submitted Data */}
                              <div className={styles.detailSection}>
                                <h4 className={styles.detailSectionTitle}>נתונים שהוגשו</h4>
                                <div className={styles.detailGrid}>
                                  {Object.entries(submitted).map(([key, value]) => {
                                    if (key === "files") return null;
                                    const label = FIELD_LABELS[key] || key;
                                    return (
                                      <div key={key} className={styles.detailField}>
                                        <span className={styles.detailLabel}>{label}</span>
                                        <span className={styles.detailValue}>{value || "—"}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Files */}
                              {submitted.files && parseFiles(submitted).length > 0 && (
                                <div className={styles.detailSection}>
                                  <h4 className={styles.detailSectionTitle}>קבצים</h4>
                                  <ul className={styles.fileList}>
                                    {parseFiles(submitted).map((file, i) => (
                                      <li key={i}>
                                        {file.url ? (
                                          <a href={file.url} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                                            {file.name || `קובץ ${i + 1}`}
                                          </a>
                                        ) : (
                                          <span>{file.name || `קובץ ${i + 1}`}</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Summit Link */}
                              {t.summitEntityId && (
                                <div className={styles.detailSection}>
                                  <h4 className={styles.detailSectionTitle}>Summit CRM</h4>
                                  <a
                                    href={`https://app.sumit.co.il`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.summitLink}
                                  >
                                    פתח ב-Summit (Entity #{t.summitEntityId})
                                  </a>
                                </div>
                              )}

                              {/* Internal Fields */}
                              {t.summitEntityId && (
                                <div className={styles.detailSection}>
                                  <h4 className={styles.detailSectionTitle}>שדות פנימיים (עדכון Summit)</h4>
                                  <div className={styles.internalFieldsGrid}>
                                    <div className={styles.internalField}>
                                      <label className={styles.inputLabel}>מנהל תיק</label>
                                      <input
                                        type="text"
                                        className={styles.textInput}
                                        value={getInternalField(t.token, "managerTik")}
                                        onChange={(e) => setInternalField(t.token, "managerTik", e.target.value)}
                                        placeholder="שם מנהל/ת התיק"
                                      />
                                    </div>
                                    <div className={styles.internalField}>
                                      <label className={styles.inputLabel}>מנהל/ת חשבונות</label>
                                      <input
                                        type="text"
                                        className={styles.textInput}
                                        value={getInternalField(t.token, "accountant")}
                                        onChange={(e) => setInternalField(t.token, "accountant", e.target.value)}
                                        placeholder="שם מנהל/ת חשבונות"
                                      />
                                    </div>
                                    <div className={styles.internalField}>
                                      <label className={styles.inputLabel}>אחראי שכר</label>
                                      <input
                                        type="text"
                                        className={styles.textInput}
                                        value={getInternalField(t.token, "payrollManager")}
                                        onChange={(e) => setInternalField(t.token, "payrollManager", e.target.value)}
                                        placeholder="שם אחראי/ת שכר"
                                      />
                                    </div>
                                  </div>
                                  <div className={styles.internalActions}>
                                    <button
                                      className={styles.saveBtn}
                                      onClick={() => handleSaveInternal(t)}
                                      disabled={savingInternal === t.token}
                                    >
                                      {savingInternal === t.token ? "שומר..." : "שמור"}
                                    </button>
                                    {internalSaveMsg[t.token] && (
                                      <span className={styles.saveMsg}>{internalSaveMsg[t.token]}</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
