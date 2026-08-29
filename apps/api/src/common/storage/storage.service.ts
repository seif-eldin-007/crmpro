import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HeadBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  HeadObjectResult,
  ListObjectKeysParams,
  ListObjectKeysResult,
  SignedDownloadUrlParams,
  SignedUploadUrlParams,
  SignedUrlResult,
  UploadFileParams,
  UploadFileResult,
} from './storage.types';

const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 3600;

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.getOrThrow<string>('storage.region');
    const accessKeyId = this.configService.getOrThrow<string>(
      'storage.accessKeyId',
    );
    const secretAccessKey = this.configService.getOrThrow<string>(
      'storage.secretAccessKey',
    );
    this.bucket = this.configService.getOrThrow<string>('storage.bucket');

    const endpoint = this.configService.get<string>('storage.endpoint');

    this.client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint && { endpoint, forcePathStyle: true }),
    });
  }

  async checkConnectivity(): Promise<boolean> {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.buffer,
        ContentType: params.contentType,
        Metadata: params.metadata,
      }),
    );

    return { key: params.key, bucket: this.bucket };
  }

  async deleteFile(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );
  }

  async headObject(objectKey: string): Promise<HeadObjectResult | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );

      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType,
      };
    } catch (error: unknown) {
      if (this.isObjectNotFound(error)) {
        return null;
      }

      throw error;
    }
  }

  private isObjectNotFound(error: unknown): boolean {
    if (error instanceof NotFound) {
      return true;
    }

    if (typeof error === 'object' && error !== null) {
      const err = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      return err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
    }

    return false;
  }

  async listObjectKeys(
    params: ListObjectKeysParams = {},
  ): Promise<ListObjectKeysResult> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: params.prefix,
        ContinuationToken: params.continuationToken,
        MaxKeys: params.maxKeys,
      }),
    );

    const keys =
      response.Contents?.map((object) => object.Key).filter(
        (key): key is string => typeof key === 'string' && key.length > 0,
      ) ?? [];

    return {
      keys,
      nextContinuationToken: response.NextContinuationToken,
    };
  }

  async getSignedUploadUrl(
    params: SignedUploadUrlParams,
  ): Promise<SignedUrlResult> {
    const expiresInSeconds =
      params.expiresInSeconds ?? DEFAULT_SIGNED_URL_EXPIRY_SECONDS;

    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        ContentType: params.contentType,
      }),
      { expiresIn: expiresInSeconds },
    );

    return {
      url,
      key: params.key,
      expiresInSeconds,
    };
  }

  async getSignedDownloadUrl(
    params: SignedDownloadUrlParams,
  ): Promise<SignedUrlResult> {
    const expiresInSeconds =
      params.expiresInSeconds ?? DEFAULT_SIGNED_URL_EXPIRY_SECONDS;

    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: params.objectKey,
      }),
      { expiresIn: expiresInSeconds },
    );

    return {
      url,
      key: params.objectKey,
      expiresInSeconds,
    };
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );

    const body = response.Body;

    if (!body) {
      throw new Error(`Empty S3 object body for key: ${objectKey}`);
    }

    const bytes = await body.transformToByteArray();

    return Buffer.from(bytes);
  }
}
