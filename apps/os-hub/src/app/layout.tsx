import type { Metadata } from "next";
import "./globals.css";
import SideNav from "@/components/SideNav";

export const metadata: Metadata = {
  title: "Bitan & Bitan OS Hub",
  description: "Operational hub for Bitan & Bitan",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex" }}>
          <SideNav />
          <main
            style={{
              marginLeft: "var(--nav-width)",
              flex: 1,
              padding: "2rem",
            }}
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
