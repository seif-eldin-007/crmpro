"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ADMIN_PERMISSIONS } from "@crmpro/shared";
import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveContracts } from "@/features/tenants/hooks";
import { useCreateTenant } from "@/features/tenants/mutations";
import {
  isValidPassword,
  isValidSlug,
  PASSWORD_HINT,
  SLUG_HINT,
  slugifyName,
} from "@/features/tenants/utils/password";
import { usePermissions } from "@/hooks/use-permissions";
import { formatNumber } from "@/lib/format";

/**
 * Full-page create form (used at /tenants/new).
 * Named dialog historically; provision flow is a dedicated page.
 */
export function CreateTenantDialog() {
  return <CreateTenantForm />;
}

export function CreateTenantForm() {
  const router = useRouter();
  const { can } = usePermissions();
  const createTenant = useCreateTenant();
  const { data: contractsData, isLoading: contractsLoading } =
    useActiveContracts({ enabled: can(ADMIN_PERMISSIONS.TENANT_CREATE) });

  const [contractId, setContractId] = useState<string>();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const contracts = contractsData?.items ?? [];
  const passwordValid = isValidPassword(ownerPassword);
  const passwordsMatch = ownerPassword === confirmPassword;
  const slugValid = isValidSlug(slug);

  useEffect(() => {
    if (!slugTouched) {
      // Deriving the slug from the workspace name until the user edits it manually
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlug(slugifyName(name));
    }
  }, [name, slugTouched]);

  if (!can(ADMIN_PERMISSIONS.TENANT_CREATE)) {
    return (
      <div className="space-y-4 px-6 py-5 md:px-8">
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Access denied</CardTitle>
            <CardDescription>
              You need the tenant.create permission to provision a workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/tenants">Back to tenants</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contractId || !slugValid || !passwordValid || !passwordsMatch) return;

    const result = await createTenant.mutateAsync({
      contractId,
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      ownerFullName: ownerFullName.trim(),
      ownerEmail: ownerEmail.trim().toLowerCase(),
      ownerPassword,
    });

    router.push(`/tenants/${result.tenant.id}`);
  };

  return (
    <div className="space-y-4 px-6 py-5 md:px-8">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon-sm" className="mt-0.5" asChild>
          <Link href="/tenants" aria-label="Back to tenants">
            <AppIcons.arrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            New tenant
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Provision an agency workspace from an active contract
          </p>
        </div>
      </div>

      <Card className="max-w-xl border-border/60 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="text-base">Workspace details</CardTitle>
          <CardDescription>
            Link a contract, set the agency identity, and create the owner
            account.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenant-contract">Contract</Label>
              <Select
                value={contractId}
                onValueChange={setContractId}
                disabled={contractsLoading}
              >
                <SelectTrigger id="tenant-contract">
                  <SelectValue
                    placeholder={
                      contractsLoading
                        ? "Loading contracts..."
                        : "Select active contract"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      <span className="flex flex-col gap-0.5 text-left">
                        <span>
                          {contract.contractName?.trim() ||
                            `${contract.planName} contract`}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {contract.planName} ·{" "}
                          {formatNumber(contract.agreedPrice)}{" "}
                          {contract.currency}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!contractsLoading && contracts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active contracts available. Create or activate a contract
                  first.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tenant-name">Agency name</Label>
              <Input
                id="tenant-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={150}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tenant-slug">Slug</Label>
              <Input
                id="tenant-slug"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value.toLowerCase());
                }}
                required
                minLength={3}
                maxLength={80}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{SLUG_HINT}</p>
              {slug && !slugValid ? (
                <p className="text-xs text-destructive">
                  Slug must be lowercase kebab-case.
                </p>
              ) : null}
            </div>

            <div className="border-t border-border/50 pt-4">
              <p className="mb-3 text-sm font-medium text-foreground">
                Owner account
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="owner-full-name">Full name</Label>
                  <Input
                    id="owner-full-name"
                    value={ownerFullName}
                    onChange={(event) => setOwnerFullName(event.target.value)}
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner-email">Email</Label>
                  <Input
                    id="owner-email"
                    type="email"
                    value={ownerEmail}
                    onChange={(event) => setOwnerEmail(event.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner-password">Password</Label>
                  <Input
                    id="owner-password"
                    type="password"
                    value={ownerPassword}
                    onChange={(event) => setOwnerPassword(event.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner-confirm-password">
                    Confirm password
                  </Label>
                  <Input
                    id="owner-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  {confirmPassword && !passwordsMatch ? (
                    <p className="text-xs text-destructive">
                      Passwords do not match.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" asChild>
                <Link href="/tenants">Cancel</Link>
              </Button>
              <Button
                type="submit"
                disabled={
                  createTenant.isPending ||
                  !contractId ||
                  name.trim().length < 2 ||
                  !slugValid ||
                  ownerFullName.trim().length < 2 ||
                  !ownerEmail.trim() ||
                  !passwordValid ||
                  !passwordsMatch
                }
              >
                {createTenant.isPending ? "Creating..." : "Create tenant"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
