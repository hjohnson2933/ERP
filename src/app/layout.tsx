import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Matches the Mill List's UI font. Exposed as --font-sans (see
// tailwind.config.ts fontFamily.sans), downloaded at build time.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "ERP",
  description: "Custom furniture ERP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
