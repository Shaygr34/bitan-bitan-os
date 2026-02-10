import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { t } from "@/lib/strings";
import styles from "./page.module.css";

const metrics = [
  { key: "dashboard.cards.activeDocuments", value: 42 },
  { key: "dashboard.cards.monthlySubmissions", value: 18 },
  { key: "dashboard.cards.pendingApproval", value: 3 },
  { key: "dashboard.cards.recentExports", value: 7 },
];

const recentActivity = [
  {
    name: "חוזר מקצועי — ליסינג מימוני",
    type: "חוזר מקצועי",
    date: "10/02/2026",
    status: "published" as const,
  },
  {
    name: "דוח רבעוני — Q4 2025",
    type: "דוח כספי",
    date: "08/02/2026",
    status: "published" as const,
  },
  {
    name: "סיכום ישיבת שותפים",
    type: "פרוטוקול",
    date: "05/02/2026",
    status: "draft" as const,
  },
  {
    name: "עדכון מס הכנסה — תיקון 259",
    type: "חוזר מקצועי",
    date: "01/02/2026",
    status: "pending" as const,
  },
  {
    name: "מכתב ללקוח — אישור ניכוי",
    type: "מכתב",
    date: "28/01/2026",
    status: "published" as const,
  },
];

const showData = recentActivity.length > 0;

export default function Home() {
  return (
    <div>
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.subtitle")}
        action={
          <button className="btn-primary">
            {t("common.actions.newDocument")}
          </button>
        }
      />

      <section className={styles.metricsSection}>
        <div className={styles.metricsGrid}>
          {metrics.map((metric) => (
            <div key={metric.key} className={styles.metricCard}>
              <span className={styles.metricLabel}>{t(metric.key)}</span>
              <span className={styles.metricValue}>{metric.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.tableSection}>
        <div className={styles.tableSectionHeader}>
          <h2 className={styles.tableSectionTitle}>
            {t("dashboard.table.title")}
          </h2>
          <button className="btn-ghost">
            {t("common.actions.export")}
          </button>
        </div>
        <div className={styles.goldSeparator} />

        {showData ? (
          <table>
            <thead>
              <tr>
                <th>{t("dashboard.table.col.name")}</th>
                <th>{t("dashboard.table.col.type")}</th>
                <th>{t("dashboard.table.col.date")}</th>
                <th>{t("dashboard.table.col.status")}</th>
                <th>{t("dashboard.table.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((row, i) => (
                <tr key={i}>
                  <td>{row.name}</td>
                  <td>{row.type}</td>
                  <td className={styles.dateCell}>{row.date}</td>
                  <td className={styles.statusCell}>
                    <StatusBadge
                      label={t(`common.status.${row.status}`)}
                      variant={row.status}
                    />
                  </td>
                  <td className={styles.actionsCell}>
                    <button className="btn-ghost">{t("common.actions.edit")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            message={t("common.emptyState.title")}
            detail={t("common.emptyState.subtitle")}
            action={
              <button className="btn-primary">
                {t("common.actions.newDocument")}
              </button>
            }
          />
        )}
      </section>
    </div>
  );
}
