"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import { t } from "@/lib/strings";
import { bitanWebsite, bitanWebsiteResources } from "@/config/integrations";
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

  // DB-backed settings override static config
  const [links, setLinks] = useState({
    siteUrl: bitanWebsite.site.url,
    studioUrl: bitanWebsite.studio.url,
    ga4Url: bitanWebsite.ga4.url,
    railwayUrl: bitanWebsiteResources.railway.url,
    githubUrl: bitanWebsiteResources.github.url,
  });

  useEffect(() => {
    // Load settings from DB
    fetch("/api/settings?group=integrations")
      .then((res) => res.json())
      .then((settings: Record<string, string>) => {
        setLinks((prev) => ({
          siteUrl: settings["integration.site.url"] || prev.siteUrl,
          studioUrl: settings["integration.studio.url"] || prev.studioUrl,
          ga4Url: settings["integration.ga4.url"] || prev.ga4Url,
          railwayUrl: settings["integration.railway.url"] || prev.railwayUrl,
          githubUrl: settings["integration.github.url"] || prev.githubUrl,
        }));
      })
      .catch(() => {
        // Fall back to static config — already set
      });

    // Health check
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
      url: links.siteUrl,
    },
    {
      key: "studio",
      label: bitanWebsite.studio.label,
      description: bitanWebsite.studio.description,
      url: links.studioUrl,
    },
    {
      key: "ga4",
      label: bitanWebsite.ga4.label,
      description: bitanWebsite.ga4.description,
      url: links.ga4Url,
    },
  ];

  const resources = [
    {
      label: bitanWebsiteResources.railway.label,
      description: bitanWebsiteResources.railway.description,
      url: links.railwayUrl,
    },
    {
      label: bitanWebsiteResources.github.label,
      description: bitanWebsiteResources.github.description,
      url: links.githubUrl,
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

      {/* ── Resources ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {t("bitanWebsite.resources.title")}
        </h2>
        <div className={styles.goldSeparator} />
        <div className={styles.resourcesGrid}>
          {resources.map((resource) => (
            <a
              key={resource.label}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.resourceLink}
            >
              <Card className={styles.resourceCard}>
                <span className={styles.resourceLabel}>
                  {resource.label}
                </span>
                <span className={styles.resourceDesc}>
                  {resource.description}
                </span>
              </Card>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
