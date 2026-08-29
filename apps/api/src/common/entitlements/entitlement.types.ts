import type { PLAN_FEATURES } from './entitlement.constants';

export type PlanFeatureKey = (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES];

export type PlanFeatureFlags = Partial<Record<PlanFeatureKey, boolean>>;
