import type {
  ContractStatus,
  PaymentFrequency,
  PaymentMethod,
} from '@crmpro/database';
import type { PlanSnapshot } from '@crmpro/shared';

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
  contractStartAt: Date;
  contractEndAt: Date | null;
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
  contractStartAt: Date;
  contractEndAt: Date | null;
  createdByAdmin: ContractAdminSummary;
  createdAt: Date;
  updatedAt: Date;
}
