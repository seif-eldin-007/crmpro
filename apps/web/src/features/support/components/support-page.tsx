"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppIcons } from "@/components/icons/app-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSupportConversation,
  useSupportConversations,
} from "@/features/support/hooks";
import {
  useCreateSupportConversation,
  useReplySupportConversation,
  useResolveSupportConversation,
} from "@/features/support/mutations";
import type {
  SupportConversationListItem,
  SupportConversationStatus,
} from "@/features/support/types";
import { usePermissions } from "@/hooks/use-permissions";
import { useRealtimeStore } from "@/stores/realtime-store";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<SupportConversationStatus, string> = {
  OPEN: "Open",
  WAITING_ON_USER: "Awaiting you",
  WAITING_ON_ADMIN: "Awaiting support",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function SupportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const { can } = usePermissions();
  const canCreate = can("support.create");
  const canUpdate = can("support.update");

  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading, isError, refetch, isFetching } =
    useSupportConversations({ limit: 50 });
  const conversations = useMemo(() => data?.items ?? [], [data?.items]);

  useEffect(() => {
    if (!selectedId && conversations.length > 0) {
      router.replace(`/support?id=${conversations[0]!.id}`, { scroll: false });
    }
  }, [conversations, selectedId, router]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Support</h1>
          <p className="text-xs text-muted-foreground">
            Message CRMPro platform operators directly
          </p>
        </div>
        {canCreate ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <AppIcons.create className="size-3.5" />
            New request
          </Button>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[280px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r">
          {isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : isError ? (
            <div className="p-4 text-sm text-destructive">
              Failed to load conversations.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                Retry
              </button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No support requests yet.
            </div>
          ) : (
            <ul>
              {conversations.map((item) => (
                <ConversationRow
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
        </aside>

        <section className="min-h-0">
          {selectedId ? (
            <ThreadPane
              key={selectedId}
              conversationId={selectedId}
              canUpdate={canUpdate}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              Select a conversation or start a new request.
            </div>
          )}
        </section>
      </div>

      <CreateConversationDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          router.replace(`/support?id=${id}`, { scroll: false });
        }}
      />
    </div>
  );
}

function ConversationRow({
  item,
  active,
  onSelect,
}: {
  item: SupportConversationListItem;
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
          {item.userUnreadCount > 0 ? (
            <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
          {item.lastMessagePreview ?? "No messages"}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
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

function ThreadPane({
  conversationId,
  canUpdate,
}: {
  conversationId: string;
  canUpdate: boolean;
}) {
  const { data, isLoading, isError, refetch } =
    useSupportConversation(conversationId);
  const reply = useReplySupportConversation(conversationId);
  const resolve = useResolveSupportConversation();
  const draftKey = `crmpro_support_draft_${conversationId}`;
  const [draft, setDraft] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(draftKey) || "";
    }
    return "";
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const socket = useRealtimeStore((state) => state.socket);
  const [isSupportTyping, setIsSupportTyping] = useState(false);
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
      if (payload.conversationId === conversationId && payload.actorType === 'ADMIN') {
        setIsSupportTyping(payload.isTyping);
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
    await reply.mutateAsync({ body });
    setDraft("");
    localStorage.removeItem(draftKey);
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
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
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{data.subject}</h2>
          <p className="text-[11px] text-muted-foreground">
            {STATUS_LABEL[data.status]} · Updated{" "}
            {formatRelativeTime(data.lastMessageAt)}
          </p>
        </div>
        {canUpdate && !closed ? (
          <Button
            variant="outline"
            size="sm"
            disabled={resolve.isPending}
            onClick={() => void resolve.mutateAsync(conversationId)}
          >
            Mark resolved
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {data.messages.map((message) => {
          const mine = message.authorType === "USER";
          const adminName = message.authorAdmin?.fullName ?? "Support";
          const initials = adminName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

          return (
            <div
              key={message.id}
              className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}
            >
              {!mine && (
                <div className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-muted/60 text-xs font-semibold text-muted-foreground ring-1 ring-border">
                  {initials}
                </div>
              )}
              
              <div
                className={cn(
                  "flex flex-col max-w-[75%]",
                  mine ? "items-end" : "items-start"
                )}
              >
                {!mine && (
                  <span className="mb-1 ml-1 text-[11px] font-medium text-muted-foreground">
                    {adminName}
                  </span>
                )}

                <div
                  className={cn(
                    "px-3.5 py-2.5 text-sm shadow-sm",
                    mine
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
                      : "border bg-card text-foreground rounded-2xl rounded-bl-sm"
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
                </div>
                
                <span className={cn(
                  "mt-1 text-[10px] text-muted-foreground",
                  mine ? "mr-1" : "ml-1"
                )}>
                  {formatRelativeTime(message.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
        {isSupportTyping && (
          <div className="flex items-end gap-2 justify-start">
            <div className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-muted/60 text-xs font-semibold text-muted-foreground ring-1 ring-border">
              SP
            </div>
            <div className="px-3.5 py-2.5 text-sm shadow-sm border bg-card text-foreground rounded-2xl rounded-bl-sm">
              <span className="flex space-x-1">
                <span className="animate-bounce inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground"></span>
                <span className="animate-bounce inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground delay-75"></span>
                <span className="animate-bounce inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground delay-150"></span>
              </span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {canUpdate && !closed ? (
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              placeholder="Write a reply…"
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
              Send
            </Button>
          </div>
        </div>
      ) : closed ? (
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          This conversation is closed. Open a new request if you need more help.
        </div>
      ) : null}
    </div>
  );
}

function CreateConversationDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useCreateSupportConversation();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    if (trimmedSubject.length < 3 || !trimmedBody) return;
    const result = await create.mutateAsync({
      subject: trimmedSubject,
      body: trimmedBody,
    });
    setSubject("");
    setBody("");
    onCreated(result.id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact support</DialogTitle>
          <DialogDescription>
            Your message goes to CRMPro platform operators — not your agency
            teammates.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="support-subject">Subject</Label>
            <Input
              id="support-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              minLength={3}
              maxLength={200}
              autoFocus
              placeholder="Billing, access, bug…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-body">Message</Label>
            <textarea
              id="support-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
              maxLength={10000}
              className="min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="Describe what you need help with…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                create.isPending ||
                subject.trim().length < 3 ||
                !body.trim()
              }
            >
              {create.isPending ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
