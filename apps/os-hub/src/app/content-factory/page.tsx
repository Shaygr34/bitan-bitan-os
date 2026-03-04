"use client";

import { useEffect, useState } from "react";
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

async function fetchStats(retries = 2, delay = 1000): Promise<HubStats | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("/api/content-factory/hub-stats");
      if (!res.ok) throw new Error(`${res.status}`);
      const data: HubStats = await res.json();
      // API returns _status: "unavailable" when DB is cold-starting
      if (data._status === "ok") return data;
      // DB not ready — retry
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
        continue;
      }
      return null;
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

export default function ContentFactoryHub() {
  const [stats, setStats] = useState<HubStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats().then((data) => {
      setStats(data);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <PageHeader
        title="מפעל התוכן"
        description="ניהול מחזור התוכן — ממקור ועד פרסום"
      />

      {/* Navigation Cards */}
      <div className={styles.cardsGrid}>
        {NAV_CARDS.map((card) => (
          <Link key={card.href} href={card.href} className={styles.cardLink}>
            <Card>
              <div className={styles.cardInner}>
                <h2 className={styles.cardTitle}>{card.title}</h2>
                <p className={styles.cardDescription}>{card.description}</p>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatValue}>
                    {loading || !stats ? "—" : stats[card.statKey]}
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
              {loading || !stats ? "—" : stats.activeSources}
            </span>
            <span className={styles.pipelineLabel}>מקורות פעילים</span>
            {stats && stats.sourceErrors > 0 && (
              <span style={{ fontSize: "0.7rem", color: "#ef4444", marginTop: "0.15rem" }}>
                {stats.sourceErrors} שגיאות
              </span>
            )}
          </div>
          <span className={styles.pipelineArrow}>←</span>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {loading || !stats ? "—" : stats.ideasNewToday}
            </span>
            <span className={styles.pipelineLabel}>רעיונות חדשים היום</span>
          </div>
          <span className={styles.pipelineArrow}>←</span>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {loading || !stats ? "—" : stats.articlesDraft}
            </span>
            <span className={styles.pipelineLabel}>טיוטות</span>
          </div>
          <span className={styles.pipelineArrow}>←</span>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {loading || !stats ? "—" : stats.articlesInReview}
            </span>
            <span className={styles.pipelineLabel}>בבדיקה</span>
          </div>
          <span className={styles.pipelineArrow}>←</span>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {loading || !stats ? "—" : stats.articlesApproved}
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
