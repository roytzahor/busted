import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Heebo } from "next/font/google";
import { Nav } from "@/components/nav";
import { AnalyticsMount } from "@/components/analytics-mount";
import { CurrencyProvider } from "@/components/currency-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { detectServerLocale } from "@/lib/locale/detect";
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

// Heebo — used for Hebrew (RTL) rendering. Latin fallback covered by Geist
// so the variable can sit in `font-family` alongside Geist without harming
// English layouts.
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
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

// `viewportFit: "cover"` is what activates `env(safe-area-inset-*)` on iOS
// notch / Dynamic Island / home-indicator devices — without it those values
// resolve to 0 and our safe-area padding below is a no-op. The app is always
// dark, so the browser chrome (address bar, status bar) is pinned to the deep
// warm-dark background instead of the amber brand color to avoid a jarring
// bright bar over a dark UI.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#170b04",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await detectServerLocale();

  return (
    <html
      lang={locale.languageMeta.htmlLang}
      dir={locale.languageMeta.dir}
      className="dark"
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${heebo.variable} min-h-dvh antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <AnalyticsMount />
        <LocaleProvider
          initialLocale={locale.language}
          initialFromOverride={locale.languageFromOverride}
        >
          <CurrencyProvider
            initialCurrency={locale.currency}
            initialCountry={locale.country}
            initialFromOverride={locale.fromOverride}
          >
            <div className="flex min-h-dvh flex-col">
              <Nav />
              <main id="main-content" className="flex-1">
                {children}
              </main>
              <footer className="mt-auto border-t border-white/8 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                <div className="mx-auto max-w-3xl space-y-2 px-[max(1rem,env(safe-area-inset-left))] text-center text-xs text-muted-foreground sm:px-6">
                  <p className="font-medium text-foreground/70">
                    {BRAND_NAME} — {BRAND_TAGLINE} Spot the fire, skip the markup.
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground/70 sm:text-xs">
                    {DISCLAIMER_LONG}
                  </p>
                </div>
              </footer>
            </div>
          </CurrencyProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
