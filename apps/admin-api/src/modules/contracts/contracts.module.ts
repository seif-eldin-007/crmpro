import { Module } from '@nestjs/common';
import { AuthRbacModule } from '../../common/auth/auth-rbac.module';
import { AuthModule } from '../auth/auth.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractsAuditService } from './services/contracts-audit.service';
import { ContractEntitlementSyncService } from './services/contract-entitlement-sync.service';

@Module({
  imports: [AuthModule, AuthRbacModule],
  controllers: [ContractsController],
  providers: [
    ContractsService,
    ContractsAuditService,
    ContractEntitlementSyncService,
  ],
})
export class ContractsModule {}
