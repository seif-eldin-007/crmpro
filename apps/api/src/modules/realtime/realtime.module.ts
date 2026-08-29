import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { AuthRbacModule } from '../../common/auth/auth-rbac.module';
import { DomainEventsModule } from '../../common/events/domain-events.module';
import { TenantAccessModule } from '../../common/tenant-access/tenant-access.module';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StringValue } from 'ms';

@Module({
  imports: [
    AuthRbacModule,
    DomainEventsModule,
    AuthModule,
    TenantAccessModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('auth.accessSecret'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            'auth.accessExpiration',
          ) as StringValue,
        },
      }),
    }),
  ],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
