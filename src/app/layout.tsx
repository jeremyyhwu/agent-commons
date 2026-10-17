import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/site-nav";
import { DemoLauncher } from "@/components/demo-launcher";
import { Providers } from "@/components/providers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agent Commons",
  description:
    "Cross-organization autonomous agent negotiation rooms with verifiable result cards.",
  openGraph: {
    title: "Agent Commons",
    description:
      "Cross-organization autonomous agent negotiation rooms with verifiable result cards.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <SiteNav />
          {children}
          <DemoLauncher />
        </Providers>
      </body>
    </html>
  );
}
