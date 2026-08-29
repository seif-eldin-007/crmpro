"use client";

import { useEffect, useState } from "react";
import { ADMIN_PERMISSIONS } from "@crmpro/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContract } from "@/features/contracts/hooks";
import {
  useCreateContract,
  useUpdateContract,
} from "@/features/contracts/mutations";
import {
  CONTRACT_CURRENCY_OPTIONS,
  PAYMENT_FREQUENCIES,
  PAYMENT_FREQUENCY_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type CreateContractInput,
  type PaymentFrequency,
  type PaymentMethod,
  type UpdateContractInput,
} from "@/features/contracts/types";
import { usePlans } from "@/features/plans/hooks";
import { usePermissions } from "@/hooks/use-permissions";

interface ContractFormDialogProps {
  open: boolean;
  contractId?: string | null;
  onClose: () => void;
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toIsoDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

export function ContractFormDialog({
  open,
  contractId,
  onClose,
}: ContractFormDialogProps) {
  const { can } = usePermissions();
  const isEdit = Boolean(contractId);
  const canOpen = isEdit
    ? can(ADMIN_PERMISSIONS.CONTRACT_UPDATE)
    : can(ADMIN_PERMISSIONS.CONTRACT_CREATE);

  if (!canOpen) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit contract" : "New contract"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update commercial terms for this draft agreement."
              : "Create a commercial agreement linked to a subscription plan."}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ContractForm
            key={contractId ?? "create-contract"}
            contractId={contractId}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ContractForm({
  contractId,
  onClose,
}: {
  contractId?: string | null;
  onClose: () => void;
}) {
  const isEdit = Boolean(contractId);
  const { data: contract, isLoading: contractLoading } = useContract(
    contractId ?? undefined,
  );
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const { data: plansData, isLoading: plansLoading } = usePlans({
    limit: 100,
    isActive: true,
  });
  const isPending = createContract.isPending || updateContract.isPending;

  const [contractName, setContractName] = useState("");
  const [planId, setPlanId] = useState("");
  const [agreedPrice, setAgreedPrice] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("BANK_TRANSFER");
  const [paymentFrequency, setPaymentFrequency] =
    useState<PaymentFrequency>("MONTHLY");
  const [contractStartAt, setContractStartAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [contractEndAt, setContractEndAt] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [gracePeriodDays, setGracePeriodDays] = useState("");
  const [autoRenew, setAutoRenew] = useState(false);
  const [notes, setNotes] = useState("");
  const [hydrated, setHydrated] = useState(!isEdit);

  useEffect(() => {
    if (!contract) return;
    // Hydrating the form from the fetched contract when editing
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContractName(contract.contractName ?? "");
    setPlanId(contract.plan.id);
    setAgreedPrice(String(contract.agreedPrice));
    setCurrency(contract.currency);
    setPaymentMethod(contract.paymentMethod);
    setPaymentFrequency(contract.paymentFrequency);
    setContractStartAt(toDateInputValue(contract.contractStartAt));
    setContractEndAt(toDateInputValue(contract.contractEndAt));
    setDiscountPercent(
      contract.discountPercent != null ? String(contract.discountPercent) : "",
    );
    setGracePeriodDays(
      contract.gracePeriodDays != null ? String(contract.gracePeriodDays) : "",
    );
    setAutoRenew(contract.autoRenew);
    setNotes(contract.notes ?? "");
    setHydrated(true);
  }, [contract]);

  const planOptions = plansData?.items ?? [];
  const selectedPlanMissing =
    planId &&
    !planOptions.some((plan) => plan.id === planId) &&
    contract?.plan
      ? contract.plan
      : null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const price = Number(agreedPrice);
    if (!planId || !Number.isFinite(price) || price < 0.01) return;

    if (isEdit && contractId) {
      const input: UpdateContractInput = {
        contractName: contractName.trim() || undefined,
        planId,
        agreedPrice: price,
        currency,
        paymentMethod,
        paymentFrequency,
        contractStartAt: toIsoDate(contractStartAt),
        contractEndAt: contractEndAt ? toIsoDate(contractEndAt) : null,
        discountPercent: parseOptionalInt(discountPercent) ?? null,
        gracePeriodDays: parseOptionalInt(gracePeriodDays) ?? null,
        autoRenew,
        notes: notes.trim() || null,
      };
      await updateContract.mutateAsync({ contractId, input });
    } else {
      const input: CreateContractInput = {
        contractName: contractName.trim() || undefined,
        planId,
        agreedPrice: price,
        currency,
        paymentMethod,
        paymentFrequency,
        contractStartAt: toIsoDate(contractStartAt),
        contractEndAt: contractEndAt ? toIsoDate(contractEndAt) : undefined,
        discountPercent: parseOptionalInt(discountPercent),
        gracePeriodDays: parseOptionalInt(gracePeriodDays),
        autoRenew,
        notes: notes.trim() || undefined,
      };
      await createContract.mutateAsync(input);
    }

    onClose();
  };

  if (isEdit && (contractLoading || !hydrated)) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Loading contract…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contract-name">Name</Label>
        <Input
          id="contract-name"
          value={contractName}
          onChange={(event) => setContractName(event.target.value)}
          maxLength={200}
          placeholder="Optional display name"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contract-plan">Plan</Label>
        <Select
          value={planId || undefined}
          onValueChange={setPlanId}
          disabled={plansLoading}
        >
          <SelectTrigger id="contract-plan">
            <SelectValue placeholder="Select plan" />
          </SelectTrigger>
          <SelectContent>
            {selectedPlanMissing ? (
              <SelectItem value={selectedPlanMissing.id}>
                {selectedPlanMissing.name}
              </SelectItem>
            ) : null}
            {planOptions.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {plan.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="contract-price">Agreed price</Label>
          <Input
            id="contract-price"
            type="number"
            min={0.01}
            step="0.01"
            required
            value={agreedPrice}
            onChange={(event) => setAgreedPrice(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contract-currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="contract-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_CURRENCY_OPTIONS.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="contract-payment-method">Payment method</Label>
          <Select
            value={paymentMethod}
            onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
          >
            <SelectTrigger id="contract-payment-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((value) => (
                <SelectItem key={value} value={value}>
                  {PAYMENT_METHOD_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="contract-payment-frequency">Frequency</Label>
          <Select
            value={paymentFrequency}
            onValueChange={(value) =>
              setPaymentFrequency(value as PaymentFrequency)
            }
          >
            <SelectTrigger id="contract-payment-frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_FREQUENCIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {PAYMENT_FREQUENCY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="contract-start">Start date</Label>
          <Input
            id="contract-start"
            type="date"
            required
            value={contractStartAt}
            onChange={(event) => setContractStartAt(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contract-end">End date</Label>
          <Input
            id="contract-end"
            type="date"
            value={contractEndAt}
            onChange={(event) => setContractEndAt(event.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="contract-discount">Discount %</Label>
          <Input
            id="contract-discount"
            type="number"
            min={0}
            max={100}
            value={discountPercent}
            onChange={(event) => setDiscountPercent(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contract-grace">Grace period (days)</Label>
          <Input
            id="contract-grace"
            type="number"
            min={0}
            max={365}
            value={gracePeriodDays}
            onChange={(event) => setGracePeriodDays(event.target.value)}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={autoRenew}
          onCheckedChange={(checked) => setAutoRenew(checked === true)}
        />
        Auto-renew
      </label>

      <div className="space-y-2">
        <Label htmlFor="contract-notes">Notes</Label>
        <textarea
          id="contract-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={5000}
          rows={3}
          className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            isPending ||
            !planId ||
            !contractStartAt ||
            !agreedPrice ||
            Number(agreedPrice) < 0.01
          }
        >
          {isPending
            ? isEdit
              ? "Saving..."
              : "Creating..."
            : isEdit
              ? "Save changes"
              : "Create contract"}
        </Button>
      </DialogFooter>
    </form>
  );
}
