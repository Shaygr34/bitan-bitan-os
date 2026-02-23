"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import { t } from "@/lib/strings";
import { bitanWebsite } from "@/config/integrations";
import styles from "./page.module.css";

interface HealthStatus {
  status: "up" | "down" | "loading";
  responseMs: number | null;
}

export default function BitanWebsitePage() {
  const [health, setHealth] = useState<HealthStatus>({
    status: "loading",
    responseMs: null,
  });

  useEffect(() => {
    fetch("/api/bitan-website/health")
      .then((res) => res.json())
      .then((data) => {
        setHealth({
          status: data.status === "up" ? "up" : "down",
          responseMs: data.responseMs ?? null,
        });
      })
      .catch(() => {
        setHealth({ status: "down", responseMs: null });
      });
  }, []);

  const quickActions = [
    {
      key: "site",
      label: bitanWebsite.site.label,
      description: bitanWebsite.site.description,
      url: bitanWebsite.site.url,
    },
    {
      key: "studio",
      label: bitanWebsite.studio.label,
      description: bitanWebsite.studio.description,
      url: bitanWebsite.studio.url,
    },
    {
      key: "ga4",
      label: bitanWebsite.ga4.label,
      description: bitanWebsite.ga4.description,
      url: bitanWebsite.ga4.url,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("bitanWebsite.title")}
        description={t("bitanWebsite.subtitle")}
      />

      {/* ── Quick Actions ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {t("bitanWebsite.quickActions.title")}
        </h2>
        <div className={styles.goldSeparator} />
        <div className={styles.actionsGrid}>
          {quickActions.map((action) => (
            <a
              key={action.key}
              href={action.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.actionLink}
            >
              <Card className={styles.actionCard}>
                <span className={styles.actionLabel}>{action.label}</span>
                <span className={styles.actionDesc}>{action.description}</span>
                <span className={styles.actionArrow}>&#8592;</span>
              </Card>
            </a>
          ))}
        </div>
      </section>

      {/* ── Status ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {t("bitanWebsite.status.title")}
        </h2>
        <div className={styles.goldSeparator} />
        <div className={styles.statusGrid}>
          <Card className={styles.statusCard}>
            <span className={styles.statusLabel}>
              {t("bitanWebsite.status.site")}
            </span>
            <div className={styles.statusRow}>
              <span
                className={`${styles.statusDot} ${
                  health.status === "loading"
                    ? styles.statusLoading
                    : health.status === "up"
                      ? styles.statusUp
                      : styles.statusDown
                }`}
              />
              <span className={styles.statusText}>
                {health.status === "loading"
                  ? t("bitanWebsite.status.checking")
                  : health.status === "up"
                    ? t("bitanWebsite.status.up")
                    : t("bitanWebsite.status.down")}
              </span>
              {health.responseMs !== null && (
                <span className={styles.responseTime}>
                  {health.responseMs}ms
                </span>
              )}
            </div>
            <span className={styles.statusNote}>
              {t("bitanWebsite.status.availabilityBasic")}
            </span>
          </Card>
        </div>
      </section>

      {/* ── Resources (placeholder) ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {t("bitanWebsite.resources.title")}
        </h2>
        <div className={styles.goldSeparator} />
        <Card className={styles.resourcesCard}>
          <span className={styles.resourcesPlaceholder}>
            {t("bitanWebsite.resources.placeholder")}
          </span>
        </Card>
      </section>
    </div>
  );
}
