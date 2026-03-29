"use client";

import { useEffect, useState, useRef } from "react";
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
}

export default function OnboardingPage() {
  const [clientName, setClientName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [tokens, setTokens] = useState<IntakeToken[]>([]);
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const linkInputRef = useRef<HTMLInputElement>(null);

  const loadTokens = () => {
    fetch("/api/intake/tokens")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTokens(Array.isArray(data) ? data : []))
      .catch(() => setTokens([]))
      .finally(() => setTokensLoaded(true));
  };

  useEffect(() => {
    loadTokens();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    setGeneratedUrl(null);
    setCopied(false);

    try {
      const res = await fetch("/api/intake/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: clientName.trim() || undefined }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "שגיאה ביצירת קישור");
      }

      const data = (await res.json()) as { url: string };
      setGeneratedUrl(data.url);
      // Refresh the tokens table
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
          <div className={styles.inputRow}>
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
                  <th>סטטוס</th>
                  <th>תאריך יצירה</th>
                  <th>קישור</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => {
                  const tokenUrl = getTokenUrl(t.token);
                  const isCopied = copiedToken === t.token;
                  return (
                    <tr key={t.token}>
                      <td>{t.clientName ?? <span style={{ color: "var(--text-caption)" }}>—</span>}</td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td className={styles.dateCell}>{relativeTime(t._createdAt)}</td>
                      <td>
                        <button
                          className={`${styles.tableCopyBtn}${isCopied ? ` ${styles.copied}` : ""}`}
                          onClick={() => handleCopyToken(tokenUrl, t.token)}
                        >
                          {isCopied ? "הועתק!" : "העתק קישור"}
                        </button>
                      </td>
                    </tr>
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
