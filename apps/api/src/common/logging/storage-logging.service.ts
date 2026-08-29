import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOGGING_CONFIG_KEYS } from './logging.constants';
import { LoggingService } from './logging.service';

@Injectable()
export class StorageLoggingService {
  private readonly enabled: boolean;

  constructor(
    private readonly loggingService: LoggingService,
    configService: ConfigService,
  ) {
    this.enabled =
      configService.get<boolean>(LOGGING_CONFIG_KEYS.enableStorageLogging) ??
      true;
  }

  uploadRequested(params: {
    tenantId: string;
    userId: string;
    sizeBytes: number;
    durationMs?: number;
  }): void {
    this.log('upload_requested', params);
  }

  uploadCompleted(params: {
    tenantId: string;
    userId: string;
    fileId: string;
    sizeBytes: number;
    durationMs?: number;
  }): void {
    this.log('upload_completed', params);
  }

  uploadFailed(params: {
    tenantId: string;
    userId: string;
    durationMs?: number;
    error: string;
  }): void {
    this.log('upload_failed', params, 'error');
  }

  downloadUrlGenerated(params: {
    tenantId: string;
    fileId: string;
    durationMs?: number;
  }): void {
    this.log('download_url_generated', params);
  }

  fileDeleted(params: {
    tenantId: string;
    userId: string;
    fileId: string;
    durationMs?: number;
  }): void {
    this.log('file_deleted', params);
  }

  orphanCleanup(params: { objectKey: string; durationMs?: number }): void {
    this.log('orphan_cleanup', params);
  }

  private log(
    operation: string,
    metadata: Record<string, unknown>,
    level: 'info' | 'error' = 'info',
  ): void {
    if (!this.enabled) {
      return;
    }

    const entry = {
      module: 'Storage',
      operation,
      tenantId:
        typeof metadata.tenantId === 'string' ? metadata.tenantId : undefined,
      userId: typeof metadata.userId === 'string' ? metadata.userId : undefined,
      durationMs:
        typeof metadata.durationMs === 'number'
          ? metadata.durationMs
          : undefined,
      status: operation,
      metadata,
    };

    if (level === 'error') {
      this.loggingService.error(entry);
      return;
    }

    this.loggingService.info(entry);
  }
}
