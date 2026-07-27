import { Paper, PaperFigure, PaperLabel, PaperRule } from "@/components/ui/paper";
import { Stamp } from "@/components/ui/stamp";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Design Primitives — Busted Internal",
  robots: { index: false, follow: false },
};

/**
 * Isolated preview of the Teardown design primitives (DESIGN.md phase 2).
 *
 * This repo has no Storybook, and these primitives are deliberately not wired
 * into any real screen yet — so without a harness they could only be reviewed
 * by reading the source. Renders each one against the real dark room, plus the
 * two states most likely to be wrong: paper on the film-grain background, and
 * the stamp straddling a paper edge so it lands on both grounds at once.
 *
 * Dev-only, same gate as the rest of /dev-monitor.
 */
export default function DesignPrimitivesPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-12 sm:px-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          DESIGN.md · phase 2
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Primitives</h1>
        <p className="text-sm text-muted-foreground">
          Not wired into any screen. Check the paper reads as opaque stock
          against the grain, and that the stamp holds on both grounds.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          Paper · retail listing
        </h2>
        <Paper className="max-w-sm">
          <PaperLabel>
            <span>Retail listing</span>
            <span>scraped</span>
          </PaperLabel>
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-mono text-xs text-paper-muted">
              imri-jewelry.co.il
            </span>
            <PaperFigure>₪238.00</PaperFigure>
          </div>
        </Paper>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          Paper · source, with stamp on the edge
        </h2>
        {/* relative + the stamp's negative offsets are what put it half on
            paper and half on the room — the case the ink-only fill exists for. */}
        <div className="relative max-w-sm">
          <Paper>
            <PaperLabel>
              <span>Source · AliExpress</span>
              <span>image-verified</span>
            </PaperLabel>
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-xs text-paper-muted">
                Custom Photo Necklace
              </span>
              <PaperFigure className="text-success">₪27.40</PaperFigure>
            </div>
            <p className="font-mono text-[11px] text-paper-muted">
              4.8 ★ · 2,431 orders · 12–18d
            </p>
            <PaperRule />
            <p className="text-sm">
              קנו במקור — חסכו <bdi className="font-mono">₪210.60</bdi>
            </p>
          </Paper>
          <Stamp className="absolute -bottom-4 end-[-12px]">
            BUSTED ×8.7
          </Stamp>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          RTL — stamp must lean the other way
        </h2>
        <div dir="rtl" className="relative max-w-sm">
          <Paper>
            <PaperLabel>
              <span>רישום קמעונאי</span>
              <span>נסרק</span>
            </PaperLabel>
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-xs text-paper-muted">
                imri-jewelry.co.il
              </span>
              <PaperFigure>₪238.00</PaperFigure>
            </div>
          </Paper>
          <Stamp className="absolute -bottom-4 end-[-12px]">
            BUSTED ×8.7
          </Stamp>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          Stamp alone · on the room
        </h2>
        <div className="flex flex-wrap items-center gap-6">
          <Stamp>BUSTED ×8.7</Stamp>
          <Stamp>BUSTED ×3.1</Stamp>
          <Stamp>BUSTED ×12.0</Stamp>
        </div>
      </section>
    </div>
  );
}
