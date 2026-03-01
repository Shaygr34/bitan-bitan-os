"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/strings";
import styles from "./SideNav.module.css";

interface NavItem {
  key: string;
  href: string;
  children?: NavItem[];
}

const mainNav: NavItem[] = [
  { key: "nav.items.dashboard", href: "/" },
  { key: "nav.items.contentEngine", href: "/content-engine" },
  {
    key: "nav.items.contentFactory",
    href: "/content-factory",
    children: [
      { key: "nav.items.contentFactory.articles", href: "/content-factory" },
      { key: "nav.items.contentFactory.ideas", href: "/content-factory/ideas" },
      { key: "nav.items.contentFactory.sources", href: "/content-factory/sources" },
    ],
  },
  { key: "nav.items.sumitSync", href: "/sumit-sync" },
  { key: "nav.items.bitanWebsite", href: "/bitan-website" },
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
          const showChildren = isActive && item.children;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.link} ${isActive ? styles.linkActive : ""}`}
              >
                {t(item.key)}
              </Link>
              {showChildren && (
                <ul className={styles.subList}>
                  {item.children!.map((child) => {
                    const childActive = pathname === child.href;
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className={`${styles.subLink} ${childActive ? styles.subLinkActive : ""}`}
                        >
                          {t(child.key)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
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
