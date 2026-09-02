"use client";

import type { LeadSource } from "@/features/lead-sources/types";
import { AppIcons } from "@/components/icons/app-icons";

interface LeadSourceDuplicateHintProps {
  duplicate: LeadSource | null;
}

export function LeadSourceDuplicateHint({
  duplicate,
}: LeadSourceDuplicateHintProps) {
  if (!duplicate) {
    return null;
  }

  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
      <AppIcons.alertCircle className="mt-0.5 size-3.5 shrink-0" />
      <span>
        A lead source named &quot;{duplicate.name}&quot; already exists.
      </span>
    </p>
  );
}
