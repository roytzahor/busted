import { SearchHub } from "@/components/search-hub";

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[540px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-500/16 via-orange-500/12 via-amber-400/8 via-35% to-background"
      />
      <SearchHub />
    </div>
  );
}
