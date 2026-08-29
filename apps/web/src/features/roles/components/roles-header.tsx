"use client";

export function RolesHeader() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Roles
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Control what each team role can access
        </p>
      </div>
    </div>
  );
}
