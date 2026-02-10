"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const channels = [
  { name: "OS Hub", href: "/" },
  { name: "Sumit Sync", href: "/sumit-sync" },
  { name: "Content Engine", href: "/content-engine" },
];

export default function SideNav() {
  const pathname = usePathname();

  return (
    <nav style={styles.nav}>
      <div style={styles.logo}>B&B OS</div>
      <ul style={styles.list}>
        {channels.map((ch) => {
          const isActive = pathname === ch.href;
          return (
            <li key={ch.href}>
              <Link
                href={ch.href}
                style={{
                  ...styles.link,
                  ...(isActive ? styles.activeLink : {}),
                }}
              >
                {ch.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    width: "var(--nav-width)",
    minHeight: "100vh",
    background: "var(--color-nav-bg)",
    color: "var(--color-nav-text)",
    display: "flex",
    flexDirection: "column",
    padding: "1.5rem 0",
    position: "fixed",
    top: 0,
    left: 0,
  },
  logo: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "#fff",
    padding: "0 1.25rem",
    marginBottom: "2rem",
  },
  list: {
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  link: {
    display: "block",
    padding: "0.625rem 1.25rem",
    borderRadius: "0 4px 4px 0",
    transition: "background 0.15s",
    color: "var(--color-nav-text)",
  },
  activeLink: {
    background: "var(--color-nav-hover-bg)",
    color: "var(--color-nav-active)",
    fontWeight: 600,
  },
};
