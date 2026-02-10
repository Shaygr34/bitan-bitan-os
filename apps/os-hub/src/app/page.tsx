import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Link from "next/link";
import styles from "./page.module.css";

const modules = [
  {
    name: "Sumit Sync",
    href: "/sumit-sync",
    description: "Synchronization workflows and data management.",
  },
  {
    name: "Content Engine",
    href: "/content-engine",
    description: "Content pipeline and publishing engine.",
  },
];

export default function Home() {
  const commit =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.COMMIT_SHA ??
    "unknown";
  const buildTime = process.env.BUILD_TIME ?? "unknown";

  return (
    <div>
      <PageHeader
        title="OS Hub"
        description="Central operations for Bitan &amp; Bitan. Manage workflows, content, and system tools from one place."
      />

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Modules</h2>
        <div className={styles.moduleGrid}>
          {modules.map((mod) => (
            <Link key={mod.href} href={mod.href} className={styles.moduleLink}>
              <Card>
                <h3 className={styles.moduleName}>{mod.name}</h3>
                <p className={styles.moduleDescription}>{mod.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <footer className={styles.buildInfo}>
        <span>{commit.slice(0, 7)}</span>
        <span className={styles.buildSeparator}>&middot;</span>
        <span>Built {buildTime}</span>
      </footer>
    </div>
  );
}
