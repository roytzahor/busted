import type { MetadataRoute } from "next";
import { BRAND_DESCRIPTION, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

/**
 * PWA manifest — served at `/manifest.webmanifest` by Next.js.
 *
 * The `share_target` stanza lets iOS Safari and Android Chrome route the
 * native Share Sheet directly into Busted: any URL shared from a browser or
 * messaging app lands at `/?share=<url>` and the home page auto-runs it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    short_name: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#170b04",
    theme_color: "#f59e0b",
    orientation: "portrait",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
    share_target: {
      action: "/",
      method: "GET",
      params: {
        title: "title",
        text: "share",
        url: "url",
      },
    },
  };
}
