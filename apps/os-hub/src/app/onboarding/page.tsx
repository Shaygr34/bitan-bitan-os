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

const MANAGERS = ["אבי ביטן", "רון ביטן"];

const FIELD_LABELS: Record<string, string> = {
  clientName: "שם לקוח",
  clientType: "סוג לקוח",
  onboardingPath: "מסלול קליטה",
  manager: "מנהל תיק",
  businessName: "שם עסק",
  businessId: "ח.פ / ת.ז",
  fullName: "שם מלא",
  companyNumber: "ת.ז / ח.פ",
  email: "דוא\"ל",
  phone: "טלפון",
  address: "כתובת",
  city: "יישוב",
  businessSector: "תחום עיסוק",
  estimatedTurnover: "מחזור שנתי משוער",
  businessAddress: "כתובת העסק",
  hasEmployees: "מעסיק עובדים",
  employeeCount: "כמה עובדים",
  previousCpaName: "רו\"ח קודם",
  previousCpaEmail: "מייל רו\"ח קודם",
  previousCpaSoftware: "תוכנות רו\"ח קודם",
  shareholderDetails: "פרטי בעלי מניות",
  contactName: "איש קשר",
  notes: "הערות",
};

const ONBOARDING_PATH_LABELS: Record<string, string> = {
  "new-individual": "עצמאי חדש",
  "new-company": "חברה חדשה",
  "transfer-individual": "עצמאי שעובר",
  "transfer-company": "חברה שעוברת",
};

// Post-submission checklist per Avi's spec
function getOnboardingChecklist(path: string, clientType: string): string[] {
  const isCompany = ["חברה", "חברה שנתי", "שותפות", "עמותה"].includes(clientType);
  const isTransfer = path.includes("transfer");

  const items: string[] = [
    "קליטת נתונים — CPA, סאמיט, רבגונית" + (isCompany ? ", ניהולית" : ""),
    "הגדרת מנהל תיק, מנהל ביקורת, מנה\"ח ועדכון הצוות",
    "הפקת ייפוי כוח — מ\"ה / מע\"מ / ניכויים / ב\"ל",
    "שליחת קודי מוסד ללקוח",
  ];

  if (isTransfer) {
    items.unshift("שליחת מייל לרו\"ח קודם — שחרור תיק + העברת מסמכים");
    items.push("קבלת גיבויים מרו\"ח קודם");
  }

  if (isCompany) {
    items.push("קליטת מוסמך לדווח ברשת החברות");
    items.push("חיבור לבנקים — בדיקת בנק ושליחת פירוט מסמכים");
  }

  items.push(
    "פתיחת קלסרים — קבע / ניכויים / הנה\"ח / דפי בנק",
    "מעקב קליטת ייפוי כוח ועדכון תדירות דיווחים",
    "בקשת ניכוי מס במקור",
    "שליחת תעודת עוסק מורשה",
    "שמירת לקוח בנייד המשרדי (וואטסאפ)",
  );

  return items;
}

// קודי מוסד letter template
function getKodeiMosadLetter(clientName: string): string {
  return `${clientName} שלום,

כחלק מייעול העבודה השוטפת בעניין תשלומים שוטפים למוסדות, נבקש להקים הרשאת חיוב בחשבון הבנק בהתאם לקודי המוסד המפורטים:

2760 – מ"ה מקדמות
2761 – מע"מ
2762 – מ"ה ניכויים
38286 – ב"ל ניכויים
28900 – ביטוח לאומי עצמאי
55755 – ביטן

מספר דגשים:
א. קוד מוסד הנו הרשאת חיוב ספציפית ישירות למוסדות במקום תשלום בשיקים.
ב. בעת הקמת הרשאת החיוב לא להגביל תאריכים וסכומים אחרת הוראת החיוב לא תאושר ע"י המוסד.
ג. מילוי מספר אסמכתא / מזהה / מספר לקוח — בעת הקמת הוראת החיוב זה שדה שקיים, צריך למלא מספר ת.ז/ח.פ/תיק ניכויים — חשוב מאוד!
ד. הוראת החיוב מבוצעת ע"י משרדנו בלבד. (מלבד ב"ל עצמאי שיורד באופן שוטף ובסכום קבוע ואוטומטי ב-22 לחודש).
ה. לשמור את מסמך הקמת הוראת החיוב ולשלוח למשרדנו. למייל heli@bitancpa.com או לפקס 03-5174298

לאחר סיום הליך הקמת הוראות החיוב לעדכן את משרדנו ע"מ שנעקוב מול הרשויות בקליטתן.

לכל שאלה ניתן לפנות למשרדנו 03-5174295
ביטן את ביטן — רואי חשבון`;
}

export default function OnboardingPage() {
  const [clientName, setClientName] = useState("");
  const [clientType, setClientType] = useState("");
  const [manager, setManager] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ message: string; names: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  const [clientTypeError, setClientTypeError] = useState(false);

  const [tokens, setTokens] = useState<IntakeToken[]>([]);
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

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
    if (!clientType) {
      setClientTypeError(true);
      return;
    }
    setClientTypeError(false);
    setGenerating(true);
    setGenerateError(null);
    setGeneratedUrl(null);
    setCopied(false);
    setDuplicateWarning(null);

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

      const data = (await res.json()) as { url: string; warning?: string; existingClients?: string[] };
      setGeneratedUrl(data.url);
      if (data.warning && data.existingClients && data.existingClients.length > 0) {
        setDuplicateWarning({ message: data.warning, names: data.existingClients });
      }
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

  const handleWhatsAppSend = (url: string) => {
    const message = `שלום! הנה קישור לטופס קליטת לקוח חדש במשרד ביטן את ביטן:\n${url}`;
    const encoded = encodeURIComponent(message);
    window.open(`https://web.whatsapp.com/send?text=${encoded}`, "_blank", "noopener,noreferrer");
  };

  const handleWhatsAppReminder = (url: string) => {
    const message = `שלום! רציתי לוודא שקיבלתם את הקישור לטופס הקליטה שלנו. ניתן למלא אותו כאן:\n${url}`;
    const encoded = encodeURIComponent(message);
    window.open(`https://web.whatsapp.com/send?text=${encoded}`, "_blank", "noopener,noreferrer");
  };

  const getStaleBadge = (t: IntakeToken): { label: string; variant: "staleWarning" | "staleDanger" } | null => {
    const ageMs = Date.now() - new Date(t._createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (t.status === "pending" && ageDays > 3) {
      return { label: "לא נפתח (3+ ימים)", variant: "staleWarning" };
    }
    if (t.status === "opened" && ageDays > 5) {
      return { label: "ממתין להשלמה", variant: "staleDanger" };
    }
    return null;
  };

  const handleCopyToken = (url: string, tokenKey: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(tokenKey);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  };

  const getTokenUrl = (token: string) => `https://bitancpa.com/intake/${token}`;

  const handleClearTokens = async () => {
    if (!confirm("למחוק את כל הקישורים הישנים? פעולה זו אינה הפיכה.")) return;
    setClearing(true);
    try {
      const res = await fetch("/api/intake/tokens", { method: "DELETE" });
      if (res.ok) {
        setTokens([]);
        setExpandedToken(null);
      }
    } catch {
      // silently fail — tokens list will remain as-is
    } finally {
      setClearing(false);
    }
  };

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
                סוג לקוח <span className={styles.requiredMark}>*</span>
              </label>
              <select
                id="clientType"
                className={`${styles.selectInput}${clientTypeError ? ` ${styles.selectError}` : ""}`}
                value={clientType}
                onChange={(e) => { setClientType(e.target.value); setClientTypeError(false); }}
              >
                <option value="">— בחר סוג —</option>
                {CLIENT_TYPES.map((ct) => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
              {clientTypeError && (
                <span className={styles.fieldError}>יש לבחור סוג לקוח</span>
              )}
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel} htmlFor="manager">
                מנהל תיק
              </label>
              <select
                id="manager"
                className={styles.selectInput}
                value={manager}
                onChange={(e) => setManager(e.target.value)}
              >
                <option value="">— בחר מנהל —</option>
                {MANAGERS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.generateBtnRow}>
            <button
              className={styles.generateBtn}
              onClick={handleGenerate}
              disabled={generating || !clientType}
            >
              {generating ? "יוצר..." : "צור קישור"}
            </button>
          </div>

          {generateError && (
            <div className={styles.generateError}>{generateError}</div>
          )}

          {duplicateWarning && (
            <div className={styles.duplicateWarning}>
              <strong>⚠ {duplicateWarning.message}</strong>
              <span>{duplicateWarning.names.join(", ")}</span>
            </div>
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
                <button
                  className={styles.whatsappBtn}
                  onClick={() => handleWhatsAppSend(generatedUrl)}
                >
                  📱 שלח בוואטסאפ
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Recent Tokens Table */}
      <section className={styles.tokensSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>קישורים אחרונים</h2>
          {tokensLoaded && tokens.length > 0 && (
            <button
              className={styles.clearBtn}
              onClick={handleClearTokens}
              disabled={clearing}
            >
              {clearing ? "מוחק..." : "נקה קישורים ישנים"}
            </button>
          )}
        </div>
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

                  const staleBadge = getStaleBadge(t);

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
                          <div className={styles.statusCell}>
                            <StatusBadge status={t.status} />
                            {staleBadge && (
                              <span className={`${styles.staleBadge} ${styles[staleBadge.variant]}`}>
                                {staleBadge.label}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={styles.dateCell}>{relativeTime(t._createdAt)}</td>
                        <td>
                          <div className={styles.tableActions}>
                            <button
                              className={`${styles.tableCopyBtn}${isCopied ? ` ${styles.copied}` : ""}`}
                              onClick={(e) => { e.stopPropagation(); handleCopyToken(tokenUrl, t.token); }}
                            >
                              {isCopied ? "הועתק!" : "העתק קישור"}
                            </button>
                            {staleBadge && (
                              <button
                                className={styles.reminderBtn}
                                onClick={(e) => { e.stopPropagation(); handleWhatsAppReminder(tokenUrl); }}
                                title="שלח תזכורת בוואטסאפ"
                              >
                                תזכורת
                              </button>
                            )}
                          </div>
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
                                      <select
                                        className={styles.textInput}
                                        value={getInternalField(t.token, "מנהל תיק")}
                                        onChange={(e) => setInternalField(t.token, "מנהל תיק", e.target.value)}
                                      >
                                        <option value="">בחר...</option>
                                        {MANAGERS.map((m) => <option key={m} value={m}>{m}</option>)}
                                      </select>
                                    </div>
                                    <div className={styles.internalField}>
                                      <label className={styles.inputLabel}>עובד/ת ביקורת</label>
                                      <input
                                        type="text"
                                        className={styles.textInput}
                                        value={getInternalField(t.token, "עובד/ת ביקורת")}
                                        onChange={(e) => setInternalField(t.token, "עובד/ת ביקורת", e.target.value)}
                                        placeholder="שם עובד/ת ביקורת"
                                      />
                                    </div>
                                    <div className={styles.internalField}>
                                      <label className={styles.inputLabel}>מנהל/ת חשבונות</label>
                                      <input
                                        type="text"
                                        className={styles.textInput}
                                        value={getInternalField(t.token, "מנהל/ת חשבונות")}
                                        onChange={(e) => setInternalField(t.token, "מנהל/ת חשבונות", e.target.value)}
                                        placeholder="שם מנהל/ת חשבונות"
                                      />
                                    </div>
                                    <div className={styles.internalField}>
                                      <label className={styles.inputLabel}>אחראי שכר</label>
                                      <input
                                        type="text"
                                        className={styles.textInput}
                                        value={getInternalField(t.token, "אחראי שכר")}
                                        onChange={(e) => setInternalField(t.token, "אחראי שכר", e.target.value)}
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
                                      {savingInternal === t.token ? "שומר..." : "שמור ב-Summit"}
                                    </button>
                                    {internalSaveMsg[t.token] && (
                                      <span className={styles.saveMsg}>{internalSaveMsg[t.token]}</span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Onboarding Checklist */}
                              {t.status === "completed" && (
                                <div className={styles.detailSection}>
                                  <h4 className={styles.detailSectionTitle}>צ&apos;קליסט קליטה</h4>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                    {getOnboardingChecklist(
                                      submitted?.onboardingPath || "new-individual",
                                      submitted?.clientType || ""
                                    ).map((item, i) => (
                                      <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                                        <input type="checkbox" style={{ marginTop: "0.2rem", accentColor: "#C5A572" }} />
                                        <span>{item}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* קודי מוסד Letter */}
                              {t.status === "completed" && (
                                <div className={styles.detailSection}>
                                  <h4 className={styles.detailSectionTitle}>קודי מוסד — מכתב ללקוח</h4>
                                  <button
                                    className={styles.saveBtn}
                                    onClick={() => {
                                      const name = submitted?.fullName || t.clientName || "לקוח יקר";
                                      const letter = getKodeiMosadLetter(name);
                                      navigator.clipboard.writeText(letter).then(() => {
                                        alert("המכתב הועתק! ניתן להדביק בוואטסאפ או במייל.");
                                      });
                                    }}
                                  >
                                    העתק מכתב קודי מוסד
                                  </button>
                                  <button
                                    className={styles.saveBtn}
                                    style={{ marginRight: "0.5rem" }}
                                    onClick={() => {
                                      const name = submitted?.fullName || t.clientName || "לקוח יקר";
                                      const letter = getKodeiMosadLetter(name);
                                      const encoded = encodeURIComponent(letter);
                                      window.open(`https://web.whatsapp.com/send?text=${encoded}`, "_blank", "noopener,noreferrer");
                                    }}
                                  >
                                    שלח בוואטסאפ
                                  </button>
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
