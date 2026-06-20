import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { AnalyticsMount } from "@/components/analytics-mount";
import {
  BRAND_DESCRIPTION,
  BRAND_NAME,
  BRAND_TAGLINE,
  DISCLAIMER_LONG,
} from "@/lib/brand";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const siteUrl = getSiteUrl();
const defaultOgImage = `${siteUrl}/api/og/scan?title=${encodeURIComponent(`${BRAND_NAME} — ${BRAND_TAGLINE}`)}`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    template: `%s · ${BRAND_NAME}`,
  },
  description: BRAND_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    description: BRAND_DESCRIPTION,
    url: siteUrl,
    images: [{ url: defaultOgImage, width: 1200, height: 630, alt: BRAND_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    description: BRAND_DESCRIPTION,
    images: [defaultOgImage],
  },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: BRAND_NAME,
  url: siteUrl,
  description: BRAND_DESCRIPTION,
  logo: `${siteUrl}/icon.png`,
  sameAs: [],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <AnalyticsMount />
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
