import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CLEANUP_SCHEDULER_HEALTH } from '../../../common/health';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';
import { BullService } from '../../jobs/bull/bull.service';
import { HealthCheckService } from './health-check.service';

describe('HealthCheckService', () => {
  it('checks all dependencies in real time', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthCheckService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
          },
        },
        {
          provide: BullService,
          useValue: {
            pingRedis: jest.fn().mockResolvedValue(true),
            areQueuesRegistered: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: StorageService,
          useValue: { checkConnectivity: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: CLEANUP_SCHEDULER_HEALTH,
          useValue: { getSchedulerStatus: jest.fn().mockReturnValue('up') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app.version') return '1.0.0';
              if (key === 'app.nodeEnv') return 'test';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    const service = module.get(HealthCheckService);
    await expect(service.getGlobalHealth()).resolves.toEqual(
      expect.objectContaining({
        api: 'up',
        database: 'up',
        redis: 'up',
        storage: 'up',
        queues: 'healthy',
        cleanupScheduler: 'up',
      }),
    );
  });
});
