import { Suspense } from "react";
import { LeadSourcesPage } from "@/features/lead-sources/components/lead-sources-page";
import { LeadSourcesSkeleton } from "@/features/lead-sources/components/lead-sources-skeleton";

export default function LeadSourcesRoutePage() {
  return (
    <Suspense fallback={<LeadSourcesSkeleton />}>
      <LeadSourcesPage />
    </Suspense>
  );
}
