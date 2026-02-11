"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/strings";
import styles from "./SideNav.module.css";

const mainNav = [
  { key: "nav.items.dashboard", href: "/" },
  { key: "nav.items.contentEngine", href: "/content-engine" },
  { key: "nav.items.contentFactory", href: "/content-factory" },
  { key: "nav.items.sumitSync", href: "/sumit-sync" },
];

const secondaryNav = [
  { key: "nav.items.documents", href: "/documents" },
  { key: "nav.items.settings", href: "/settings" },
];

export default function SideNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        <div className={styles.brandName}>Bitan &amp; Bitan</div>
        <div className={styles.brandLabel}>Operating System</div>
      </div>

      <ul className={styles.list}>
        {mainNav.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.link} ${isActive ? styles.linkActive : ""}`}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={styles.separator} />

      <ul className={styles.list}>
        {secondaryNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.link} ${isActive ? styles.linkActive : ""}`}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={styles.navFooter}>
        <span className={styles.version}>ביטן את ביטן</span>
      </div>
    </nav>
  );
}
