import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
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
  title: "BuyPass — Stop Paying Dropshipping Markups",
  description:
    "Detect dropshipping markups and find original AliExpress suppliers. Save up to 80% on every purchase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <div className="flex min-h-screen flex-col">
          <Nav />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <footer className="border-t py-6">
            <div className="text-muted-foreground mx-auto max-w-6xl px-4 text-center text-xs sm:px-6 sm:text-sm">
              <p>
                BuyPass helps consumers find original suppliers and avoid
                dropshipping markups.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
