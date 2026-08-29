import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  API_ERROR_CODES,
  mapExceptionToApiErrorResponse,
} from '@crmpro/shared/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

describe('PublicService', () => {
  let service: PublicService;
  let prisma: {
    tenant: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PublicService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PublicService);
  });

  it('returns workspace details for an existing tenant', async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      name: 'Prime Estates',
      slug: 'prime-estates',
    });

    await expect(
      service.lookupWorkspaceBySlug('prime-estates'),
    ).resolves.toEqual({
      exists: true,
      name: 'Prime Estates',
      slug: 'prime-estates',
      logoUrl: null,
    });

    expect(prisma.tenant.findFirst).toHaveBeenCalledWith({
      where: { slug: 'prime-estates', deletedAt: null },
      select: { name: true, slug: true },
    });
  });

  it('throws NOT_FOUND for a missing workspace slug', async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);

    try {
      await service.lookupWorkspaceBySlug('unknown-workspace');
      fail('Expected NotFoundException');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);

      const { status, body } = mapExceptionToApiErrorResponse(error);
      expect(status).toBe(404);
      expect(body).toEqual({
        success: false,
        error: {
          code: API_ERROR_CODES.NOT_FOUND,
          message: 'Workspace not found',
        },
      });
    }
  });

  it('returns workspace details for a suspended tenant', async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      name: 'Suspended Co',
      slug: 'suspended-co',
    });

    await expect(
      service.lookupWorkspaceBySlug('suspended-co'),
    ).resolves.toEqual({
      exists: true,
      name: 'Suspended Co',
      slug: 'suspended-co',
      logoUrl: null,
    });
  });

  it('throws NOT_FOUND for a soft-deleted tenant', async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);

    await expect(
      service.lookupWorkspaceBySlug('deleted-workspace'),
    ).rejects.toThrow(NotFoundException);
  });

  it('does not filter by tenant status', async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      name: 'Cancelled Co',
      slug: 'cancelled-co',
    });

    await service.lookupWorkspaceBySlug('cancelled-co');

    expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'cancelled-co', deletedAt: null },
      }),
    );
  });
});

describe('PublicController', () => {
  let controller: PublicController;
  let publicService: { lookupWorkspaceBySlug: jest.Mock };

  beforeEach(async () => {
    publicService = {
      lookupWorkspaceBySlug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [{ provide: PublicService, useValue: publicService }],
    }).compile();

    controller = module.get(PublicController);
  });

  it('returns success envelope for an existing workspace', async () => {
    publicService.lookupWorkspaceBySlug.mockResolvedValue({
      exists: true,
      name: 'Prime Estates',
      slug: 'prime-estates',
      logoUrl: null,
    });

    await expect(controller.getWorkspace('prime-estates')).resolves.toEqual({
      success: true,
      data: {
        exists: true,
        name: 'Prime Estates',
        slug: 'prime-estates',
        logoUrl: null,
      },
    });
  });

  it('propagates NOT_FOUND when workspace does not exist', async () => {
    publicService.lookupWorkspaceBySlug.mockRejectedValue(
      new NotFoundException('Workspace not found'),
    );

    await expect(controller.getWorkspace('unknown-workspace')).rejects.toThrow(
      NotFoundException,
    );
  });
});
