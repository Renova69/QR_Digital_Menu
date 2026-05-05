import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import { extname } from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );

    this.bucket = this.configService.get<string>(
      'R2_BUCKET_NAME',
      'qr-menu-uploads',
    );
    this.publicUrl = this.configService.get<string>('R2_PUBLIC_URL', '');

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
    });

    this.logger.log(`R2 Storage initialized — bucket: ${this.bucket}`);
  }

  /**
   * Upload a file buffer to Cloudflare R2.
   * Returns the full public CDN URL.
   */
  async upload(
    fileBuffer: Buffer,
    originalName: string,
    contentType: string,
  ): Promise<string> {
    const ext = extname(originalName);
    const key = `${randomBytes(16).toString('hex')}${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      }),
    );

    const url = `${this.publicUrl.replace(/\/$/, '')}/${key}`;
    this.logger.log(`Uploaded: ${key} → ${url}`);
    return url;
  }

  /**
   * Delete a file from R2 by its key or full URL.
   */
  async delete(keyOrUrl: string): Promise<void> {
    // Extract key from full URL if needed
    const key = keyOrUrl.startsWith('http')
      ? keyOrUrl.split('/').pop() || keyOrUrl
      : keyOrUrl;

    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      this.logger.log(`Deleted: ${key}`);
    } catch (error) {
      this.logger.warn(`Failed to delete ${key}: ${error}`);
    }
  }
}
