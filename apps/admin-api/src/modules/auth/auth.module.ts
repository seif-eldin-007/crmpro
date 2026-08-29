import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { AuthRbacModule } from '../../common/auth/auth-rbac.module';
import { SecurityModule } from '../../common/security/security.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AdminSecurityService } from './services/admin-security.service';
import { AdminSessionService } from './services/admin-session.service';
import { AuthAuditService } from './services/auth-audit.service';
import { LoginAttemptLimiterService } from './services/login-attempt-limiter.service';

@Module({
  imports: [
    AuthRbacModule,
    SecurityModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
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
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtStrategy,
    AdminSessionService,
    AdminSecurityService,
    AuthAuditService,
    LoginAttemptLimiterService,
  ],
  exports: [
    AuthService,
    TokenService,
    AuthRbacModule,
    AdminSessionService,
    AdminSecurityService,
  ],
})
export class AuthModule {}
