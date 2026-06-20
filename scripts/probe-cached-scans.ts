import { prisma } from "@/lib/prisma";

async function main() {
  const rows = await prisma.scannedProduct.findMany({
    select: { id: true, originalUrl: true, aliexpressUrl: true, lastScrapedAt: true },
    where: { aliexpressUrl: { not: null } },
    orderBy: { lastScrapedAt: "desc" },
    take: 5,
  });

  if (rows.length === 0) {
    console.log("No cached scans with aliexpressUrl found.");
    return;
  }

  for (const r of rows) {
    console.log(
      `${r.id.slice(0, 10)} · ${r.lastScrapedAt.toISOString().slice(0, 10)} · ${r.originalUrl.slice(0, 60)}`,
    );
    console.log(`           ali → ${r.aliexpressUrl?.slice(0, 90)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
