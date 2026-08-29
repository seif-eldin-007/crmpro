"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AppIcons } from "@/components/icons/app-icons";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FileRowActions, FileRowContextMenu } from "@/features/files/components/file-row-actions";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { FileAsset, FilesSortField } from "@/features/files/types";
import {
  formatFileCategory,
  formatFileSize,
  getFileCategoryTone,
  getFileKind,
  getFileKindTone,
  getFileTypeLabel,
} from "@/features/files/utils/file-formatters";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FilesTableProps {
  files: FileAsset[];
  sortBy: FilesSortField;
  sortOrder: "asc" | "desc";
  onSortChange: (sortBy: FilesSortField, sortOrder: "asc" | "desc") => void;
  selectedFileIds: string[];
  onToggleFile: (fileId: string) => void;
  onToggleAll: (checked: boolean) => void;
  canSelect?: boolean;
  highlightedFileId?: string | null;
  onHighlightFile?: (fileId: string) => void;
}

function SortableHeader({
  label,
  column,
  sortBy,
  sortOrder,
  onSortChange,
  className,
}: {
  label: string;
  column: FilesSortField;
  sortBy: FilesSortField;
  sortOrder: "asc" | "desc";
  onSortChange: (sortBy: FilesSortField, sortOrder: "asc" | "desc") => void;
  className?: string;
}) {
  const isSorted = sortBy === column;

  return (
    <th
      className={cn(
        "h-8 px-3 font-medium text-[11px] tracking-wide text-muted-foreground uppercase",
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-0.5 transition-colors hover:text-foreground",
          isSorted && "text-foreground",
        )}
        onClick={() =>
          onSortChange(
            column,
            isSorted && sortOrder === "desc" ? "asc" : "desc",
          )
        }
      >
        {label}
        {isSorted ? (
          <AppIcons.chevronDown
            className={cn("size-3", sortOrder === "asc" && "rotate-180")}
          />
        ) : null}
      </button>
    </th>
  );
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  const kind = getFileKind(mimeType);
  const Icon =
    kind === "pdf"
      ? AppIcons.exports
      : kind === "csv"
        ? AppIcons.imports
        : AppIcons.files;

  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md",
        getFileKindTone(kind),
      )}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

export function FilesTable({
  files,
  sortBy,
  sortOrder,
  onSortChange,
  selectedFileIds,
  onToggleFile,
  onToggleAll,
  canSelect = false,
  highlightedFileId,
}: FilesTableProps) {
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const allSelected =
    files.length > 0 && files.every((file) => selectedFileIds.includes(file.id));
  const someSelected =
    files.some((file) => selectedFileIds.includes(file.id)) && !allSelected;

  useEffect(() => {
    if (!highlightedFileId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [highlightedFileId, files]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead className="border-b border-border/50 bg-muted/25">
          <tr>
            {canSelect ? (
              <th className="h-8 w-10 px-3">
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={(checked) => onToggleAll(checked === true)}
                  aria-label="Select all files"
                />
              </th>
            ) : null}
            <SortableHeader
              label="File"
              column="originalFilename"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
            <th className="h-8 px-3 text-left font-medium text-[11px] tracking-wide text-muted-foreground uppercase">
              Category
            </th>
            <th className="h-8 px-3 text-left font-medium text-[11px] tracking-wide text-muted-foreground uppercase">
              Linked to
            </th>
            <SortableHeader
              label="Size"
              column="sizeBytes"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
            <SortableHeader
              label="Uploaded"
              column="createdAt"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
            <th className="h-8 w-20 px-2" />
          </tr>
        </thead>
        <tbody>
          {files.map((file) => {
            const highlighted = file.id === highlightedFileId;
            const selected = selectedFileIds.includes(file.id);
            return (
              <ContextMenu key={file.id}>
                <ContextMenuTrigger asChild>
                  <tr
                    ref={highlighted ? highlightRef : undefined}
                    className={cn(
                      "border-b border-border/40 transition-colors last:border-b-0 hover:bg-muted/20",
                      (highlighted || selected) && "bg-primary/5",
                    )}
                  >
                    {canSelect ? (
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => onToggleFile(file.id)}
                          aria-label={`Select ${file.originalFilename}`}
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileTypeIcon mimeType={file.mimeType} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {file.originalFilename}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {getFileTypeLabel(file.mimeType)} ·{" "}
                            {file.uploadedBy.fullName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 px-1.5 text-[10px] font-medium",
                          getFileCategoryTone(file.category),
                        )}
                      >
                        {formatFileCategory(file.category)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {file.lead ? (
                        <Link
                          href={`/leads?id=${file.lead.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {file.lead.fullName}
                        </Link>
                      ) : file.project ? (
                        <Link
                          href={`/projects?projectId=${file.project.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {file.project.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                      {formatFileSize(file.sizeBytes)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatRelativeTime(file.createdAt)}
                    </td>
                    <td className="px-2 py-2">
                      <FileRowActions file={file} />
                    </td>
                  </tr>
                </ContextMenuTrigger>
                <FileRowContextMenu file={file} />
              </ContextMenu>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
