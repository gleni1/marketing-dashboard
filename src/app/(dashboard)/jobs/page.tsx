import { JobsView } from "./JobsView";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ from_lead?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-7 pb-14 flex flex-col gap-6">
      <JobsView prefillLeadId={params.from_lead || null} />
    </main>
  );
}
