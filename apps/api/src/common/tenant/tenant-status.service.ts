import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantStatus } from '@crmpro/database';
import { PrismaService } from '../prisma/prisma.service';

export class TenantInactiveException extends ForbiddenException {
  readonly tenantInactive = true as const;

  constructor(message = 'Tenant is inactive.') {
    super(message);
  }
}

@Injectable()
export class TenantStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async assertTenantActive(tenantId: string): Promise<void> {
    const status = await this.getTenantStatus(tenantId);

    if (
      status === TenantStatus.SUSPENDED ||
      status === TenantStatus.CANCELLED
    ) {
      throw new TenantInactiveException();
    }
  }

  async isTenantActive(tenantId: string): Promise<boolean> {
    const status = await this.getTenantStatus(tenantId);

    return (
      status !== TenantStatus.SUSPENDED && status !== TenantStatus.CANCELLED
    );
  }

  private async getTenantStatus(tenantId: string): Promise<TenantStatus> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { status: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant.status;
  }
}
