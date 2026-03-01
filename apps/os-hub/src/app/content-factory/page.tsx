"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import styles from "./page.module.css";

interface HubStats {
  articles: number;
  articlesInReview: number;
  articlesApproved: number;
  ideas: number;
  ideasNewToday: number;
  activeSources: number;
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

export default function ContentFactoryHub() {
  const [stats, setStats] = useState<HubStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/content-factory/hub-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
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
                    {loading ? "—" : (stats?.[card.statKey] ?? 0)}
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
              {loading ? "—" : (stats?.activeSources ?? 0)}
            </span>
            <span className={styles.pipelineLabel}>מקורות פעילים</span>
          </div>
          <span className={styles.pipelineArrow}>←</span>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {loading ? "—" : (stats?.ideasNewToday ?? 0)}
            </span>
            <span className={styles.pipelineLabel}>רעיונות חדשים היום</span>
          </div>
          <span className={styles.pipelineArrow}>←</span>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {loading ? "—" : (stats?.articlesInReview ?? 0)}
            </span>
            <span className={styles.pipelineLabel}>מאמרים בבדיקה</span>
          </div>
          <span className={styles.pipelineArrow}>←</span>
          <div className={styles.pipelineStep}>
            <span className={styles.pipelineValue}>
              {loading ? "—" : (stats?.articlesApproved ?? 0)}
            </span>
            <span className={styles.pipelineLabel}>פורסמו</span>
          </div>
        </div>
      </section>
    </div>
  );
}
