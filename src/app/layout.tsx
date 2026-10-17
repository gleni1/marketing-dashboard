import type { Metadata } from "next";
import "./globals.css";
import { SWRProvider } from "@/providers/SWRProvider";

export const metadata: Metadata = {
  title: "Ace Roofing NJ - Marketing Dashboard",
  description: "Track leads, jobs, and marketing spend for Ace Roofing NJ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ground text-ink antialiased">
        <SWRProvider>{children}</SWRProvider>
      </body>
    </html>
  );
}
