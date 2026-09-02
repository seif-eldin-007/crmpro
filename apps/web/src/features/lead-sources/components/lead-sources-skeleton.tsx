"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function LeadSourcesSkeleton() {
  return (
    <div className="space-y-4 px-6 py-5 md:px-8">
      <div className="space-y-1.5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-border/50 px-4 py-3">
          <Skeleton className="h-8 w-full max-w-xs" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="ml-auto h-8 w-36" />
        </div>
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0"
            >
              <Skeleton className="size-8 rounded-md" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="ml-auto h-4 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
