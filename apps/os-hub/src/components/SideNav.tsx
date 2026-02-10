"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./SideNav.module.css";

const channels = [
  { name: "OS Hub", href: "/" },
  { name: "Sumit Sync", href: "/sumit-sync" },
  { name: "Content Engine", href: "/content-engine" },
];

export default function SideNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        <div className={styles.brandName}>B&amp;B</div>
        <div className={styles.brandLabel}>Operating System</div>
      </div>

      <ul className={styles.list}>
        {channels.map((ch) => {
          const isActive =
            ch.href === "/"
              ? pathname === "/"
              : pathname === ch.href || pathname.startsWith(ch.href + "/");
          return (
            <li key={ch.href}>
              <Link
                href={ch.href}
                className={`${styles.link} ${isActive ? styles.linkActive : ""}`}
              >
                {ch.name}
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
