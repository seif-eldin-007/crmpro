/**
 * In-shell loading fallback shown while navigating to any protected route.
 * Renders inside the app shell, so it fills the content area rather than the
 * full viewport.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  );
}
