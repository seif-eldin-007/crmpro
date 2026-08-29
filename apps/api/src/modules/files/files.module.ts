import { Module } from '@nestjs/common';
import { AuthRbacModule } from '../../common/auth/auth-rbac.module';
import { QuotaModule } from '../../common/quota/quota.module';
import { AuditModule } from '../audit/audit.module';
import { LeadAttachmentModule } from '../lead-attachments/lead-attachment.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [
    AuthRbacModule,
    QuotaModule,
    AuditModule,
    NotificationsModule,
    LeadAttachmentModule,
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
