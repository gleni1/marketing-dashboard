import { OverviewView } from "./OverviewView";

type Period = "this-month" | "last-30" | "quarter" | "ytd";

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function OverviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const period = (params.period as Period) || "this-month";

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-7 pb-14 flex flex-col gap-6">
      <OverviewView period={period} />
    </main>
  );
}
