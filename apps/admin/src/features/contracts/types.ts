import type { PlanSnapshot } from "@crmpro/shared";
import type { ListQueryParams, PaginatedResponse } from "@/types/pagination";

export const CONTRACT_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "EXPIRED",
  "TERMINATED",
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const PAYMENT_METHODS = [
  "BANK_TRANSFER",
  "CASH",
  "CHEQUE",
  "INSTAPAY",
  "OTHER",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_FREQUENCIES = [
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUAL",
  "ANNUAL",
  "CUSTOM",
] as const;

export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];

export interface ContractPlanSummary {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ContractAdminSummary {
  id: string;
  fullName: string;
  email: string;
}

export interface ContractListItem {
  id: string;
  contractName: string | null;
  status: ContractStatus;
  planName: string;
  agreedPrice: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentFrequency: PaymentFrequency;
  contractStartAt: string;
  contractEndAt: string | null;
  gracePeriodDays: number | null;
  autoRenew: boolean;
}

export interface ContractDetail {
  id: string;
  contractName: string | null;
  status: ContractStatus;
  plan: ContractPlanSummary;
  /** Frozen plan terms captured at signing; null for legacy contracts. */
  planSnapshot: PlanSnapshot | null;
  tenantId: string | null;
  agreedPrice: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentFrequency: PaymentFrequency;
  discountPercent: number | null;
  gracePeriodDays: number | null;
  autoRenew: boolean;
  notes: string | null;
  contractStartAt: string;
  contractEndAt: string | null;
  createdByAdmin: ContractAdminSummary;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContractInput {
  contractName?: string;
  planId: string;
  agreedPrice: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentFrequency: PaymentFrequency;
  contractStartAt: string;
  contractEndAt?: string;
  discountPercent?: number;
  gracePeriodDays?: number;
  autoRenew?: boolean;
  notes?: string;
}

export interface UpdateContractInput {
  contractName?: string;
  planId?: string;
  agreedPrice?: number;
  currency?: string;
  paymentMethod?: PaymentMethod;
  paymentFrequency?: PaymentFrequency;
  contractStartAt?: string;
  contractEndAt?: string | null;
  discountPercent?: number | null;
  gracePeriodDays?: number | null;
  autoRenew?: boolean;
  notes?: string | null;
}

export type ContractsListParams = ListQueryParams & {
  status?: ContractStatus;
  planId?: string;
  currency?: string;
  paymentMethod?: PaymentMethod;
  paymentFrequency?: PaymentFrequency;
};

export type ContractsListResponse = PaginatedResponse<ContractListItem>;

export const CONTRACT_CURRENCY_OPTIONS = ["EGP", "USD", "AED", "SAR"] as const;

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  TERMINATED: "Terminated",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  CHEQUE: "Cheque",
  INSTAPAY: "Instapay",
  OTHER: "Other",
};

export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUAL: "Semi-annual",
  ANNUAL: "Annual",
  CUSTOM: "Custom",
};
