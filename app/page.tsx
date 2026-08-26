import { Suspense } from "react";
import { SearchHub } from "@/components/search-hub";

export default function Home() {
  return (
    <div className="relative">
      {/* The four fixed blur(80-160px) ambient blobs that used to sit here are
          gone — see DESIGN.md. They were the strongest "generic AI SaaS" tell
          on the page and among the most expensive things on it to paint. The
          film grain on `body::after` (app/globals.css) is the replacement. */}
      {/* useSearchParams() in SearchHub forces a Suspense boundary in Next 15. */}
      <Suspense fallback={null}>
        <SearchHub />
      </Suspense>
    </div>
  );
}
