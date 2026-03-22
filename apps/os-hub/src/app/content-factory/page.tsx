"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import styles from "./page.module.css";

interface HubStats {
  _status: "ok" | "unavailable";
  articles: number;
  articlesInReview: number;
  articlesApproved: number;
  articlesDraft: number;
  ideas: number;
  ideasNewToday: number;
  activeSources: number;
  sourceErrors: number;
  lastSuccessfulPoll: string | null;
}

// RTL flow: rightmost → leftmost = מקורות → רעיונות → מאמרים
const NAV_CARDS = [
  {
    title: "מקורות",
    description: "ניהול מקורות תוכן — RSS, API וגרידה",
    href: "/content-factory/sources",
    statKey: "activeSources" as const,
    statLabel: "מקורות פעילים",
  },
  {
    title: "רעיונות",
    description: "רעיונות לתוכן — מקורות RSS, ידני ו-AI",
    href: "/content-factory/ideas",
    statKey: "ideas" as const,
    statLabel: "רעיונות",
  },
  {
    title: "מאמרים",
    description: "ניהול מאמרים, עריכה והפצה לפלטפורמות",
    href: "/content-factory/articles",
    statKey: "articles" as const,
    statLabel: "מאמרים",
  },
];

const MAX_RETRY_ATTEMPTS = 3;

async function fetchStatsOnce(): Promise<HubStats | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch("/api/content-factory/hub-stats", {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data: HubStats = await res.json();
    return data._status === "ok" ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export default function ContentFactoryHub() {
  const [stats, setStats] = useState<HubStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setFailed(false);

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      setRetryAttempt(attempt);
      const data = await fetchStatsOnce();

      if (data) {
        setStats(data);
        setLoading(false);
        setRetryAttempt(0);
        return;
      }

      // Exponential backoff between retries (2s, 4s)
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }

    // All retries exhausted
    setLoading(false);
    setFailed(true);
    setRetryAttempt(0);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  function renderStatValue(key: keyof HubStats) {
    if (loading) {
      return <span className={styles.shimmerValue} />;
    }
    if (!stats) return "—";
    return stats[key] as number;
  }

  return (
    <div className="animate-page">
      <PageHeader
        title="מפעל התוכן"
        description="ניהול מחזור התוכן — ממקור ועד פרסום"
      />

      {/* Loading bar */}
      {loading && (
        <div className={styles.loadingBar}>
          <div className={styles.loadingBarInner} />
        </div>
      )}

      {/* Retry status during loading */}
      {loading && retryAttempt > 1 && (
        <div className={styles.retryNotice}>
          השרת מתעורר... ניסיון {retryAttempt} מתוך {MAX_RETRY_ATTEMPTS}
        </div>
      )}

      {/* DB unavailable notice with retry */}
      {failed && !loading && (
        <div className={styles.unavailableNotice}>
          <span>מסד הנתונים לא זמין כרגע</span>
          <button className={styles.retryButton} onClick={loadStats}>
            נסו שוב
          </button>
        </div>
      )}

      {/* Navigation Cards */}
      <div className={`${styles.cardsGrid} animate-stagger`}>
        {NAV_CARDS.map((card) => (
          <Link key={card.href} href={card.href} className={styles.cardLink}>
            <Card>
              <div className={styles.cardInner}>
                <h2 className={styles.cardTitle}>{card.title}</h2>
                <p className={styles.cardDescription}>{card.description}</p>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatValue}>
                    {renderStatValue(card.statKey)}
                  </span>
                  <span className={styles.cardStatLabel}>{card.statLabel}</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pipeline Summary */}
      <section className={styles.pipelineSection}>
        <h2 className={styles.sectionTitle}>צינור התוכן</h2>
        <div className={styles.goldSeparator} />
        <div className={styles.pipeline}>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {renderStatValue("activeSources")}
            </span>
            <span className={styles.pipelineLabel}>מקורות פעילים</span>
          </div>
          <span className={styles.pipelineArrow}>←</span>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {renderStatValue("ideasNewToday")}
            </span>
            <span className={styles.pipelineLabel}>רעיונות חדשים היום</span>
          </div>
          <span className={styles.pipelineArrow}>←</span>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {renderStatValue("articlesDraft")}
            </span>
            <span className={styles.pipelineLabel}>טיוטות</span>
          </div>
          <span className={styles.pipelineArrow}>←</span>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {renderStatValue("articlesInReview")}
            </span>
            <span className={styles.pipelineLabel}>בבדיקה</span>
          </div>
          <span className={styles.pipelineArrow}>←</span>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {renderStatValue("articlesApproved")}
            </span>
            <span className={styles.pipelineLabel}>פורסמו</span>
          </div>
        </div>
        {stats?.lastSuccessfulPoll && (
          <div style={{ textAlign: "center", marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-caption, #9ca3af)" }}>
            סריקה אחרונה מוצלחת: {new Date(stats.lastSuccessfulPoll).toLocaleString("he-IL")}
          </div>
        )}
      </section>
    </div>
  );
}
