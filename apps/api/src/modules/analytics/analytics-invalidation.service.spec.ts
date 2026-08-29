import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../../common/cache/cache.service';
import { AnalyticsInvalidationService } from './analytics-invalidation.service';

describe('AnalyticsInvalidationService', () => {
  let service: AnalyticsInvalidationService;
  let cacheService: { invalidateTenantAnalytics: jest.Mock };

  beforeEach(async () => {
    cacheService = {
      invalidateTenantAnalytics: jest.fn().mockResolvedValue(3),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsInvalidationService,
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get(AnalyticsInvalidationService);
  });

  it('invalidates all analytics cache keys for a tenant', async () => {
    await service.invalidateTenant('tenant-1');

    expect(cacheService.invalidateTenantAnalytics).toHaveBeenCalledWith(
      'tenant-1',
    );
  });
});
