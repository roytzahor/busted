import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

/**
 * Dynamic Open Graph card for a scan result.
 *
 * Query params:
 *   title    — product title (up to 80 chars rendered)
 *   savings  — savings percent (integer)
 *   storeUsd — original retail price (optional, formatted as $X)
 *   aliUsd   — AliExpress supplier price (optional)
 *   image    — product image URL (must be a publicly-accessible https URL)
 *
 * Returns a 1200×630 PNG suitable for Twitter, LinkedIn, WhatsApp, iMessage.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") ?? "Mystery product").slice(0, 80);
  const savingsRaw = Number(searchParams.get("savings"));
  const savings = Number.isFinite(savingsRaw) && savingsRaw > 0
    ? Math.round(savingsRaw)
    : null;
  const storeUsd = Number(searchParams.get("storeUsd"));
  const aliUsd = Number(searchParams.get("aliUsd"));
  const image = searchParams.get("image");

  const showPriceRow =
    Number.isFinite(storeUsd) && storeUsd > 0 && Number.isFinite(aliUsd) && aliUsd > 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background:
            "linear-gradient(135deg, #1a0d05 0%, #2a1408 40%, #1f1610 100%)",
          padding: 60,
          fontFamily: "sans-serif",
        }}
      >
        {/* Ambient corner glow */}
        <div
          style={{
            position: "absolute",
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "rgba(245,158,11,0.25)",
            filter: "blur(120px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -200,
            left: -200,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: "rgba(34,197,94,0.18)",
            filter: "blur(120px)",
          }}
        />

        {/* Left column — product image */}
        {image ? (
          <div
            style={{
              width: 420,
              height: 420,
              borderRadius: 32,
              border: "2px solid rgba(255,255,255,0.12)",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.04)",
              marginRight: 60,
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt=""
              width={420}
              height={420}
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
            />
          </div>
        ) : null}

        {/* Right column — copy */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            zIndex: 1,
          }}
        >
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
              }}
            >
              🔥
            </div>
            <span
              style={{
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: -1,
                color: "white",
              }}
            >
              Busted
            </span>
          </div>

          {/* Headline + savings */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {savings !== null ? (
              <div
                style={{
                  fontSize: 110,
                  fontWeight: 900,
                  letterSpacing: -4,
                  lineHeight: 1,
                  background:
                    "linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%)",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Save {savings}%
              </div>
            ) : (
              <div
                style={{
                  fontSize: 80,
                  fontWeight: 900,
                  color: "white",
                  letterSpacing: -2,
                }}
              >
                They&rsquo;re busted.
              </div>
            )}

            <p
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                lineHeight: 1.25,
                margin: 0,
                maxWidth: 600,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {title}
            </p>

            {showPriceRow ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 20,
                  fontSize: 32,
                  fontWeight: 700,
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    color: "#f87171",
                    textDecoration: "line-through",
                    textDecorationColor: "rgba(248,113,113,0.6)",
                  }}
                >
                  ${storeUsd.toFixed(storeUsd >= 100 ? 0 : 2)}
                </span>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 26 }}>
                  →
                </span>
                <span style={{ color: "#34d399" }}>
                  ${aliUsd.toFixed(aliUsd >= 100 ? 0 : 2)}
                </span>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <p
            style={{
              fontSize: 20,
              color: "rgba(255,255,255,0.55)",
              margin: 0,
              fontWeight: 500,
            }}
          >
            Spot the markup · Find the source · busted.app
          </p>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
