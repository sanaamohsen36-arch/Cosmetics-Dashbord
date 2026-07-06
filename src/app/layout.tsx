import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../styles.css";

export const metadata: Metadata = {
  title: "تقارير المبيعات والإعلانات",
  description: "Shared sales and ads dashboard powered by Supabase",
  icons: {
    icon: "/company-logo.svg",
    shortcut: "/company-logo.svg",
    apple: "/company-logo.svg"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
