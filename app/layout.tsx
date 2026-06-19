import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import {
  BRAND_DESCRIPTION,
  BRAND_NAME,
  BRAND_TAGLINE,
  DISCLAIMER_LONG,
} from "@/lib/brand";
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
  title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
  description: BRAND_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <div className="flex min-h-screen flex-col">
          <Nav />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <footer className="mt-auto border-t border-white/8 py-6">
            <div className="mx-auto max-w-3xl space-y-2 px-4 text-center text-xs text-muted-foreground sm:px-6">
              <p className="font-medium text-foreground/70">
                {BRAND_NAME} — {BRAND_TAGLINE} Spot the fire, skip the markup.
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground/70 sm:text-xs">
                {DISCLAIMER_LONG}
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
