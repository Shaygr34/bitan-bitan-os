import type { Metadata } from "next";
import "./globals.css";
import SideNav from "@/components/SideNav";

export const metadata: Metadata = {
  title: "Bitan & Bitan OS",
  description: "Operational system for Bitan & Bitan",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <SideNav />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
