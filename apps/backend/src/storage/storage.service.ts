import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

const sharp = require('sharp');

/** Processed image result with optional thumbnail */
export interface ProcessedUpload {
  /** Full-size optimised image URL */
  url: string;
  /** Thumbnail URL (400px max dimension) */
  thumbnailUrl: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  /** Max dimension (width or height) for the main image */
  private static readonly MAX_DIMENSION = 1200;
  /** Max dimension for thumbnails */
  private static readonly THUMB_DIMENSION = 400;
  /** WebP quality for main images (0-100) */
  private static readonly QUALITY_MAIN = 82;
  /** WebP quality for thumbnails */
  private static readonly QUALITY_THUMB = 75;

  private static readonly ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

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
    // Fall back to the local backend origin so dev environments without
    // R2_PUBLIC_URL still produce fully-qualified URLs (required by DTO
    // @IsUrl validators and safe for <img src> rendering).
    const r2Public = this.configService.get<string>('R2_PUBLIC_URL', '');
    const port = this.configService.get<number>('PORT', 3000);
    this.publicUrl = r2Public || `http://localhost:${port}`;

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
   * Process, optimise, and upload an image to Cloudflare R2.
   *
   * Pipeline:
   *  1. Validate MIME type
   *  2. Resize to max 1200px (longest edge), preserving aspect ratio
   *  3. Convert to WebP at quality 82
   *  4. Generate 400px thumbnail at quality 75
   *  5. Upload both to R2
   *
   * Returns URLs for the optimised image and its thumbnail.
   */
  async upload(
    fileBuffer: Buffer,
    originalName: string,
    contentType: string,
  ): Promise<string> {
    if (!StorageService.ALLOWED_TYPES.includes(contentType)) {
      throw new Error(
        `Unsupported image type "${contentType}". Only JPEG, PNG, and WebP are allowed.`,
      );
    }

    const result = await this.uploadOptimised(fileBuffer);
    return result.url;
  }

  /**
   * Full upload returning both main + thumbnail URLs.
   * Use this when you need the thumbnail reference too.
   */
  async uploadWithThumbnail(
    fileBuffer: Buffer,
    originalName: string,
    contentType: string,
  ): Promise<ProcessedUpload> {
    if (!StorageService.ALLOWED_TYPES.includes(contentType)) {
      throw new Error(
        `Unsupported image type "${contentType}". Only JPEG, PNG, and WebP are allowed.`,
      );
    }

    return this.uploadOptimised(fileBuffer);
  }

  /**
   * Core image processing + upload pipeline.
   */
  private async uploadOptimised(fileBuffer: Buffer): Promise<ProcessedUpload> {
    const id = randomBytes(16).toString('hex');
    const mainKey = `${id}.webp`;
    const thumbKey = `${id}_thumb.webp`;

    // Get metadata to log savings
    const originalSize = fileBuffer.length;
    const metadata = await sharp(fileBuffer).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    // --- Main image: resize + WebP ---
    // limitInputPixels caps decompression to 200MP (150M is sharp default; 200M
    // = 14142×14142px which covers all realistic restaurant photos). Guards
    // against decompression-bomb payloads that would OOM the process.
    const mainBuffer = await sharp(fileBuffer, { limitInputPixels: 200_000_000 })
      .rotate() // auto-rotate based on EXIF orientation
      .resize({
        width: StorageService.MAX_DIMENSION,
        height: StorageService.MAX_DIMENSION,
        fit: 'inside', // preserve aspect ratio, fit within box
        withoutEnlargement: true, // don't upscale small images
      })
      .webp({ quality: StorageService.QUALITY_MAIN })
      .toBuffer();

    // --- Thumbnail: smaller resize + lower quality WebP ---
    const thumbBuffer = await sharp(fileBuffer, { limitInputPixels: 200_000_000 })
      .rotate()
      .resize({
        width: StorageService.THUMB_DIMENSION,
        height: StorageService.THUMB_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: StorageService.QUALITY_THUMB })
      .toBuffer();

    // Upload both in parallel — immutable cache-control lets Cloudflare CDN cache forever
    await Promise.all([
      this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: mainKey,
          Body: mainBuffer,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      ),
      this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: thumbKey,
          Body: thumbBuffer,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      ),
    ]);

    const base = this.publicUrl.replace(/\/$/, '');
    const url = `${base}/${mainKey}`;
    const thumbnailUrl = `${base}/${thumbKey}`;

    // Log compression stats
    const savings = ((1 - mainBuffer.length / originalSize) * 100).toFixed(1);
    this.logger.log(
      `Uploaded: ${originalWidth}×${originalHeight} → ` +
        `main ${(mainBuffer.length / 1024).toFixed(0)}KB, ` +
        `thumb ${(thumbBuffer.length / 1024).toFixed(0)}KB ` +
        `(${savings}% smaller)`,
    );

    return { url, thumbnailUrl };
  }

  /**
   * Delete a file from R2 by its key or full URL.
   */
  private extractManagedKey(keyOrUrl: string): string | null {
    if (!/^https?:\/\//i.test(keyOrUrl)) {
      return keyOrUrl;
    }

    try {
      const fileUrl = new URL(keyOrUrl);
      const storageUrl = new URL(this.publicUrl);
      const storagePath = storageUrl.pathname.replace(/\/$/, '');
      const isManagedOrigin = fileUrl.origin === storageUrl.origin;
      const isManagedPath =
        !storagePath || fileUrl.pathname.startsWith(`${storagePath}/`);

      if (!isManagedOrigin || !isManagedPath) {
        return null;
      }

      return decodeURIComponent(fileUrl.pathname.split('/').pop() || '');
    } catch {
      return null;
    }
  }

  async delete(keyOrUrl: string): Promise<void> {
    const key = this.extractManagedKey(keyOrUrl);
    if (!key) {
      this.logger.warn(`Skipping unmanaged image URL: ${keyOrUrl}`);
      return;
    }

    try {
      // Delete both main image and thumbnail
      await Promise.all([
        this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
          }),
        ),
        // Also attempt to delete the thumbnail variant
        this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key.replace('.webp', '_thumb.webp'),
          }),
        ),
      ]);
      this.logger.log(`Deleted: ${key} (+ thumbnail)`);
    } catch (error) {
      this.logger.warn(`Failed to delete ${key}: ${error}`);
    }
  }
}
