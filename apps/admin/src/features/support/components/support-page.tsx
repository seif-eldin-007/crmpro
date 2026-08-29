"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ADMIN_PERMISSIONS } from "@crmpro/shared";
import { AppIcons } from "@/components/icons/app-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdminSupportConversation,
  useAdminSupportConversations,
  useAdminSupportSummary,
} from "@/features/support/hooks";
import {
  useReplyAdminSupport,
  useUpdateAdminSupportStatus,
} from "@/features/support/mutations";
import type {
  AdminSupportConversationListItem,
  SupportConversationStatus,
} from "@/features/support/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePermissions } from "@/hooks/use-permissions";
import { useRealtimeStore } from "@/stores/realtime-store";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<SupportConversationStatus, string> = {
  OPEN: "Open",
  WAITING_ON_USER: "Waiting on user",
  WAITING_ON_ADMIN: "Needs reply",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function SupportPage() {
  const { can } = usePermissions();
  const canAccess = can(ADMIN_PERMISSIONS.SUPPORT_ACCESS);
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    SupportConversationStatus | "all"
  >("all");
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: summary } = useAdminSupportSummary({ enabled: canAccess });
  const { data, isLoading, isError, refetch, isFetching } =
    useAdminSupportConversations(
      {
        limit: 50,
        search: debouncedSearch.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      },
      { enabled: canAccess },
    );

  const conversations = useMemo(() => data?.items ?? [], [data?.items]);

  useEffect(() => {
    if (!selectedId && conversations.length > 0) {
      router.replace(`/support?id=${conversations[0]!.id}`, { scroll: false });
    }
  }, [conversations, selectedId, router]);

  if (!canAccess) {
    return (
      <div className="px-6 py-8 text-sm text-muted-foreground">
        You need support access to view the inbox.
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 md:px-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Support inbox</h1>
          <p className="text-xs text-muted-foreground">
            Conversations from tenant users across all agencies
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <Badge variant="outline">
            {formatNumber(summary?.waitingOnAdmin ?? 0)} need reply
          </Badge>
          <Badge variant="secondary">
            {formatNumber(summary?.unread ?? 0)} unread
          </Badge>
          <Badge variant="outline">
            {formatNumber(summary?.open ?? 0)} open
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-6">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search subject or tenant…"
          className="h-8 max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value as SupportConversationStatus | "all",
            )
          }
          className="h-8 rounded-md border bg-transparent px-2 text-xs"
        >
          <option value="all">All statuses</option>
          <option value="WAITING_ON_ADMIN">Needs reply</option>
          <option value="WAITING_ON_USER">Waiting on user</option>
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b lg:border-b-0 lg:border-r">
          {isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : isError ? (
            <div className="p-4 text-sm text-destructive">
              Failed to load inbox.{" "}
              <button type="button" className="underline" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No conversations match.
            </div>
          ) : (
            <ul>
              {conversations.map((item) => (
                <AdminConversationRow
                  key={item.id}
                  item={item}
                  active={item.id === selectedId}
                  onSelect={() =>
                    router.replace(`/support?id=${item.id}`, { scroll: false })
                  }
                />
              ))}
            </ul>
          )}
          {isFetching && !isLoading ? (
            <p className="px-3 py-2 text-[10px] text-muted-foreground">Refreshing…</p>
          ) : null}
        </aside>

        <section className="min-h-0">
          {selectedId ? (
            <AdminThreadPane key={selectedId} conversationId={selectedId} />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              Select a conversation to reply.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function AdminConversationRow({
  item,
  active,
  onSelect,
}: {
  item: AdminSupportConversationListItem;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full border-b px-3 py-3 text-left transition-colors hover:bg-muted/40",
          active && "bg-muted/50",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium">{item.subject}</p>
          {item.adminUnreadCount > 0 ? (
            <Badge className="h-5 px-1.5 text-[10px]">
              {item.adminUnreadCount}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {item.tenant.name} · {item.createdByUser.name}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
          {item.lastMessagePreview ?? "—"}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "h-5 px-1.5 text-[10px]",
              item.status === "WAITING_ON_ADMIN" &&
                "border-amber-500/30 text-amber-700 dark:text-amber-400",
            )}
          >
            {STATUS_LABEL[item.status]}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(item.lastMessageAt)}
          </span>
        </div>
      </button>
    </li>
  );
}

function AdminThreadPane({ conversationId }: { conversationId: string }) {
  const { data, isLoading, isError, refetch } =
    useAdminSupportConversation(conversationId);
  const reply = useReplyAdminSupport(conversationId);
  const updateStatus = useUpdateAdminSupportStatus();
  const draftKey = `crmpro_admin_support_draft_`;
  const [draft, setDraft] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(draftKey) || "";
    }
    return "";
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const socket = useRealtimeStore((state) => state.socket);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    // Loading the persisted draft for the newly selected conversation (external storage sync)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setDraft(saved);
    else setDraft("");
  }, [conversationId, draftKey]);

  useEffect(() => {
    if (draft.trim()) {
      localStorage.setItem(draftKey, draft);
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [draft, draftKey]);

  useEffect(() => {
    if (!socket) return;
    const onTyping = (payload: { conversationId: string, actorType: string, isTyping: boolean }) => {
      if (payload.conversationId === conversationId && payload.actorType === 'USER') {
        setIsUserTyping(payload.isTyping);
      }
    };
    socket.on('typing', onTyping);
    return () => { socket.off('typing', onTyping); };
  }, [socket, conversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [data?.messages]);

  const closed =
    data?.status === "RESOLVED" || data?.status === "CLOSED";

  const handleDraftChange = (val: string) => {
    setDraft(val);
    if (socket) {
      socket.emit('typing', { conversationId, isTyping: true });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { conversationId, isTyping: false });
      }, 2000);
    }
  };

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    await reply.mutateAsync(body);
    setDraft("");
    localStorage.removeItem(draftKey);
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load thread.{" "}
        <button type="button" className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{data.subject}</h2>
          <p className="text-[11px] text-muted-foreground">
            <Link
              href={`/tenants/${data.tenant.id}`}
              className="text-primary hover:underline"
            >
              {data.tenant.name}
            </Link>
            <span className="mx-1">·</span>
            {data.createdByUser.name} ({data.createdByUser.email})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!closed ? (
            <Button
              variant="outline"
              size="sm"
              disabled={updateStatus.isPending}
              onClick={() =>
                void updateStatus.mutateAsync({
                  conversationId,
                  status: "RESOLVED",
                })
              }
            >
              Resolve
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={updateStatus.isPending}
              onClick={() =>
                void updateStatus.mutateAsync({
                  conversationId,
                  status: "WAITING_ON_ADMIN",
                })
              }
            >
              Reopen
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {data.messages.map((message) => {
            const fromAdmin = message.authorType === "ADMIN";
            const userName = message.authorUser?.name ?? "User";
            const adminName = message.authorAdmin?.fullName ?? "Support";
            
            const initials = fromAdmin 
              ? adminName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
              : userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

            return (
              <div
                key={message.id}
                className={cn("flex items-end gap-2", fromAdmin ? "justify-end" : "justify-start")}
              >
                {!fromAdmin && (
                  <div className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-muted/60 text-xs font-semibold text-muted-foreground ring-1 ring-border">
                    {initials}
                  </div>
                )}
                
                <div
                  className={cn(
                    "flex flex-col max-w-[75%]",
                    fromAdmin ? "items-end" : "items-start"
                  )}
                >
                  {/* Sender Name (only if not me) */}
                  {!fromAdmin && (
                    <span className="mb-1 ml-1 text-[11px] font-medium text-muted-foreground">
                      {userName}
                    </span>
                  )}

                  <div
                    className={cn(
                      "px-3.5 py-2.5 text-sm shadow-sm",
                      fromAdmin
                        ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
                        : "border bg-card text-foreground rounded-2xl rounded-bl-sm"
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
                  </div>
                  
                  {/* Timestamp */}
                  <span className={cn(
                    "mt-1 text-[10px] text-muted-foreground",
                    fromAdmin ? "mr-1" : "ml-1"
                  )}>
                    {formatRelativeTime(message.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>

      {!closed ? (
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              placeholder={isUserTyping ? "User is typing…" : "Reply to the agency user…"}
              maxLength={10000}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
            />
            <Button
              disabled={!draft.trim() || reply.isPending}
              onClick={() => void handleSend()}
            >
              <AppIcons.mail className="size-3.5" />
              Send
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Conversation resolved. Reopen to continue chatting.
        </div>
      )}
    </div>
  );
}
