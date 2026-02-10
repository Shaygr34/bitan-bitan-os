import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import SideNav from "@/components/SideNav";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

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
    <html lang="he" dir="rtl">
      <body className={heebo.className}>
        <div className="app-shell">
          <SideNav />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
