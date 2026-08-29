import { PERMISSIONS } from '@crmpro/shared/auth';
import {
  canViewActivitySection,
  getRequiredPermissionForSection,
  getVisibleDashboardSections,
} from './analytics-section-permissions.util';

describe('analytics-section-permissions.util', () => {
  it('maps owner permissions to all dashboard sections', () => {
    const permissions = new Set(Object.values(PERMISSIONS));

    expect(getVisibleDashboardSections(permissions)).toEqual({
      overview: true,
      pipeline: true,
      trends: true,
      team: true,
      activity: true,
      sources: true,
      projects: true,
      developers: true,
      status: true,
    });
  });

  it('omits sections without required permissions', () => {
    const permissions = new Set([
      PERMISSIONS.ANALYTICS_READ,
      PERMISSIONS.PIPELINE_READ,
    ]);

    expect(getVisibleDashboardSections(permissions)).toEqual({
      overview: true,
      pipeline: true,
      trends: true,
      team: false,
      activity: false,
      sources: true,
      projects: true,
      developers: true,
      status: true,
    });
  });

  it('allows activity with audit.read or lead.read', () => {
    expect(canViewActivitySection(new Set([PERMISSIONS.AUDIT_READ]))).toBe(
      true,
    );
    expect(canViewActivitySection(new Set([PERMISSIONS.LEAD_READ]))).toBe(true);
    expect(canViewActivitySection(new Set([PERMISSIONS.USER_READ]))).toBe(
      false,
    );
  });

  it('returns required permission keys for fixed sections', () => {
    expect(getRequiredPermissionForSection('overview')).toBe(
      PERMISSIONS.ANALYTICS_READ,
    );
    expect(getRequiredPermissionForSection('pipeline')).toBe(
      PERMISSIONS.PIPELINE_READ,
    );
    expect(getRequiredPermissionForSection('team')).toBe(PERMISSIONS.USER_READ);
    expect(getRequiredPermissionForSection('activity')).toBeNull();
  });
});
