import { SearchHub } from "@/components/search-hub";

export default function Home() {
  return (
    <div className="relative">
      {/* Cinematic ambient blobs — fixed so they fill the whole viewport */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-60 -right-60 h-[900px] w-[900px] rounded-full bg-primary/14 blur-[160px]" />
        <div className="absolute -bottom-80 -left-80 h-[750px] w-[750px] rounded-full bg-success/9 blur-[130px]" />
        <div className="absolute top-1/3 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/7 blur-[100px]" />
        <div className="absolute bottom-1/3 right-1/4 h-[280px] w-[280px] rounded-full bg-destructive/5 blur-[80px]" />
      </div>
      <SearchHub />
    </div>
  );
}
