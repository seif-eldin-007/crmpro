"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  ContractActivateDialog,
  ContractArchiveDialog,
  ContractTerminateDialog,
} from "@/features/contracts/components/contract-action-dialogs";
import { ContractFormDialog } from "@/features/contracts/components/contract-form-dialog";
import { ContractStatusBadge } from "@/features/contracts/components/contract-status-badge";
import { useContract } from "@/features/contracts/hooks";
import type { ContractListItem } from "@/features/contracts/types";
import {
  PAYMENT_FREQUENCY_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/features/contracts/types";
import { usePermissions } from "@/hooks/use-permissions";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatStorageBytes,
} from "@/lib/format";

interface ContractDetailPageProps {
  contractId: string;
}

export function ContractDetailPage({ contractId }: ContractDetailPageProps) {
  const router = useRouter();
  const { data: contract, isLoading, isError, refetch, isFetching } =
    useContract(contractId);
  const { can } = usePermissions();
  const [formOpen, setFormOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (isLoading && !contract) {
    return (
      <div className="space-y-4 px-6 py-5 md:px-8">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !contract) {
    return (
      <div className="space-y-4 px-6 py-5 md:px-8">
        <Button variant="ghost" size="sm" asChild className="h-8 px-2">
          <Link href="/contracts">
            <AppIcons.arrowLeft className="size-3.5" />
            Contracts
          </Link>
        </Button>
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AppIcons.alertCircle className="size-5" />
              Failed to load contract
            </CardTitle>
            <CardDescription>
              This contract may have been archived or you don&apos;t have
              access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Retrying..." : "Retry"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const listItem: ContractListItem = {
    id: contract.id,
    contractName: contract.contractName,
    status: contract.status,
    planName: contract.plan.name,
    agreedPrice: contract.agreedPrice,
    currency: contract.currency,
    paymentMethod: contract.paymentMethod,
    paymentFrequency: contract.paymentFrequency,
    contractStartAt: contract.contractStartAt,
    contractEndAt: contract.contractEndAt,
    gracePeriodDays: contract.gracePeriodDays,
    autoRenew: contract.autoRenew,
  };

  const canUpdate = can(ADMIN_PERMISSIONS.CONTRACT_UPDATE);
  const canTerminate = can(ADMIN_PERMISSIONS.CONTRACT_TERMINATE);
  const canEdit = canUpdate && contract.status === "DRAFT";
  const canActivate = canUpdate && contract.status === "DRAFT";
  const canTerminateAction =
    canTerminate &&
    (contract.status === "ACTIVE" || contract.status === "EXPIRED");
  const canArchiveAction =
    canUpdate &&
    (contract.status === "DRAFT" ||
      contract.status === "TERMINATED" ||
      contract.status === "EXPIRED");

  return (
    <div className="space-y-4 px-6 py-5 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" asChild className="h-8 px-2">
            <Link href="/contracts">
              <AppIcons.arrowLeft className="size-3.5" />
              Contracts
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {contract.contractName?.trim() || "Untitled contract"}
            </h1>
            <ContractStatusBadge status={contract.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {contract.plan.name}
            {contract.autoRenew ? " · Auto-renew" : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFormOpen(true)}
            >
              <AppIcons.edit className="size-3.5" />
              Edit
            </Button>
          ) : null}
          {canActivate ? (
            <Button size="sm" onClick={() => setActivateOpen(true)}>
              Activate
            </Button>
          ) : null}
          {canTerminateAction ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setTerminateOpen(true)}
            >
              Terminate
            </Button>
          ) : null}
          {canArchiveAction ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setArchiveOpen(true)}
            >
              Archive
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DetailCard title="Commercial terms">
          <DetailRow
            label="Agreed price"
            value={formatMoney(contract.agreedPrice, contract.currency)}
          />
          <DetailRow
            label="Payment method"
            value={PAYMENT_METHOD_LABELS[contract.paymentMethod]}
          />
          <DetailRow
            label="Frequency"
            value={PAYMENT_FREQUENCY_LABELS[contract.paymentFrequency]}
          />
          <DetailRow
            label="Discount"
            value={
              contract.discountPercent != null
                ? `${formatNumber(contract.discountPercent)}%`
                : "—"
            }
          />
        </DetailCard>

        <DetailCard title="Term">
          <DetailRow
            label="Starts"
            value={formatDate(contract.contractStartAt)}
          />
          <DetailRow
            label="Ends"
            value={formatDate(contract.contractEndAt)}
          />
          <DetailRow
            label="Grace period"
            value={
              contract.gracePeriodDays != null
                ? `${formatNumber(contract.gracePeriodDays)} days`
                : "—"
            }
          />
          <DetailRow
            label="Auto-renew"
            value={contract.autoRenew ? "Yes" : "No"}
          />
        </DetailCard>

        <DetailCard title="Plan at signing">
          {contract.planSnapshot ? (
            <>
              <DetailRow
                label="Plan"
                value={contract.planSnapshot.name || "—"}
              />
              <DetailRow
                label="Max users"
                value={limitLabel(contract.planSnapshot.quotas.maxUsers)}
              />
              <DetailRow
                label="Max leads"
                value={limitLabel(contract.planSnapshot.quotas.maxLeads)}
              />
              <DetailRow
                label="Max projects"
                value={limitLabel(contract.planSnapshot.quotas.maxProjects)}
              />
              <DetailRow
                label="Max storage"
                value={
                  contract.planSnapshot.quotas.maxStorageBytes !== null
                    ? formatStorageBytes(
                        Number(contract.planSnapshot.quotas.maxStorageBytes),
                      )
                    : "Unlimited"
                }
              />
              <DetailRow
                label="Features"
                value={featureFlagsLabel(contract.planSnapshot.featureFlags)}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Legacy contract — signed before plan snapshots existed. Uses the
              current live plan values.
            </p>
          )}
        </DetailCard>

        <DetailCard title="Meta">
          <DetailRow
            label="Plan"
            value={contract.plan.name}
          />
          <DetailRow
            label="Tenant"
            value={contract.tenantId ?? "Unassigned"}
          />
          <DetailRow
            label="Created by"
            value={contract.createdByAdmin.fullName}
          />
          <DetailRow label="Created" value={formatDate(contract.createdAt)} />
          <DetailRow label="Updated" value={formatDate(contract.updatedAt)} />
        </DetailCard>
      </div>

      {contract.notes ? (
        <Card className="gap-3 py-4 shadow-sm">
          <CardHeader className="px-5 pb-0">
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {contract.notes}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <ContractFormDialog
        open={formOpen}
        contractId={contract.id}
        onClose={() => setFormOpen(false)}
      />
      <ContractActivateDialog
        contract={listItem}
        open={activateOpen}
        onClose={() => setActivateOpen(false)}
      />
      <ContractTerminateDialog
        contract={listItem}
        open={terminateOpen}
        onClose={() => setTerminateOpen(false)}
      />
      <ContractArchiveDialog
        contract={listItem}
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onArchived={() => router.push("/contracts")}
      />
    </div>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-3 py-4 shadow-sm">
      <CardHeader className="px-5 pb-0">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-5">{children}</CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function limitLabel(value: number | null) {
  return value === null ? "Unlimited" : formatNumber(value);
}

function featureFlagsLabel(flags: Record<string, boolean>) {
  const enabled = Object.entries(flags)
    .filter(([, enabledFlag]) => enabledFlag)
    .map(([key]) => key);

  return enabled.length > 0 ? enabled.join(", ") : "None";
}
