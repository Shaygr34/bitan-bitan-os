import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import { t } from "@/lib/strings";
import styles from "./page.module.css";

interface Module {
  key: string;
  descKey: string;
  href: string;
  comingSoon?: boolean;
}

const modules: Module[] = [
  {
    key: "nav.items.contentEngine",
    descKey: "dashboard.modules.contentEngine.description",
    href: "/content-engine",
  },
  {
    key: "nav.items.contentFactory",
    descKey: "dashboard.modules.contentFactory.description",
    href: "/content-factory",
  },
  {
    key: "nav.items.sumitSync",
    descKey: "dashboard.modules.sumitSync.description",
    href: "/sumit-sync",
  },
  {
    key: "nav.items.customerOnboarding",
    descKey: "dashboard.modules.customerOnboarding.description",
    href: "#",
    comingSoon: true,
  },
  {
    key: "nav.items.analytics",
    descKey: "dashboard.modules.analytics.description",
    href: "#",
    comingSoon: true,
  },
];

export default function Home() {
  return (
    <div>
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.subtitle")}
      />

      <section className={styles.modulesSection}>
        <h2 className={styles.sectionTitle}>{t("dashboard.modules.title")}</h2>
        <div className={styles.goldSeparator} />
        <div className={styles.modulesGrid}>
          {modules.map((mod) =>
            mod.comingSoon ? (
              <div key={mod.key} className={styles.moduleLink}>
                <Card className={styles.comingSoonCard}>
                  <div className={styles.moduleHeader}>
                    <h3 className={styles.moduleName}>{t(mod.key)}</h3>
                    <span className={styles.comingSoonBadge}>{t("dashboard.comingSoon")}</span>
                  </div>
                  <p className={styles.moduleDescription}>{t(mod.descKey)}</p>
                </Card>
              </div>
            ) : (
              <Link key={mod.href} href={mod.href} className={styles.moduleLink}>
                <Card>
                  <h3 className={styles.moduleName}>{t(mod.key)}</h3>
                  <p className={styles.moduleDescription}>{t(mod.descKey)}</p>
                </Card>
              </Link>
            )
          )}
        </div>
      </section>

      <section className={styles.comingSoonSection}>
        <p className={styles.comingSoonText}>
          {t("dashboard.comingSoonDetail")}
        </p>
      </section>
    </div>
  );
}
