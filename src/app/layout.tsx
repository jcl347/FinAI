import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PutStrike - Put Options Selling Optimizer",
  description:
    "Research-backed put selling optimization tool. Find optimal strike prices, expirations, and stocks for cash-secured put strategies.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-white min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
