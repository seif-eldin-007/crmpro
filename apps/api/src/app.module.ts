import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { HttpLoggingInterceptor } from './common/logging/interceptors/http-logging.interceptor';
import { CacheModule } from './common/cache/cache.module';
import { DomainEventsModule } from './common/events/domain-events.module';
import { LoggingModule } from './common/logging/logging.module';
import { RequestIdMiddleware } from './common/logging/middleware/request-id.middleware';
import { PrismaModule } from './common/prisma/prisma.module';
import { SecurityModule } from './common/security/security.module';
import { StorageModule } from './common/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { DevelopersModule } from './modules/developers/developers.module';
import { LeadSourcesModule } from './modules/lead-sources/lead-sources.module';
import { LeadsModule } from './modules/leads/leads.module';
import { PipelinesModule } from './modules/pipelines/pipelines.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { FilesModule } from './modules/files/files.module';
import { ImportJobsModule } from './modules/import-jobs/import-jobs.module';
import { ExportJobsModule } from './modules/export-jobs/export-jobs.module';
import { JobsCoreModule } from './modules/jobs/jobs-core.module';
import { WorkersModule } from './modules/jobs/workers.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { PublicModule } from './modules/public/public.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { SupportModule } from './modules/support/support.module';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      { name: 'hourly', ttl: 3_600_000, limit: 2_000 },
    ]),
    LoggingModule,
    DomainEventsModule,
    CacheModule,
    PrismaModule,
    SecurityModule,
    StorageModule,
    AuthModule,
    PipelinesModule,
    LeadSourcesModule,
    LeadsModule,
    DevelopersModule,
    ProjectsModule,
    FilesModule,
    JobsCoreModule,
    ImportJobsModule,
    ExportJobsModule,
    WorkersModule,
    MonitoringModule,
    RealtimeModule,
    AnalyticsModule,
    NotificationsModule,
    AuditModule,
    UsersModule,
    RolesModule,
    SupportModule,
    PublicModule,
  ],
  controllers: [],
  providers: [
    GlobalExceptionFilter,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
