import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { randomBytes } from 'crypto';
import { getDependencyNodeAgents } from '../common/http/dependency-http';
import { requestBudgetSignal } from '../common/http/request-budget';
import {
  createProviderCircuit,
  classifyProviderError,
} from '../common/http/provider-circuit';

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
  private readonly circuit = createProviderCircuit('r2');

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
      // P1-5: the AWS SDK's node handler defaults to no request timeout at
      // all (DEFAULT_REQUEST_TIMEOUT = 0), so a hung R2 upload held a Cloud
      // Run request slot until the platform's own 300s ceiling. Image uploads
      // are large-ish, hence a generous body timeout and a tight connect one.
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 3_000,
        requestTimeout: 20_000,
        httpsAgent: getDependencyNodeAgents('r2').httpsAgent,
      }),
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
    restaurantId: string,
  ): Promise<string> {
    if (!StorageService.ALLOWED_TYPES.includes(contentType)) {
      throw new Error(
        `Unsupported image type "${contentType}". Only JPEG, PNG, and WebP are allowed.`,
      );
    }

    const result = await this.uploadOptimised(fileBuffer, restaurantId);
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
    restaurantId: string,
  ): Promise<ProcessedUpload> {
    if (!StorageService.ALLOWED_TYPES.includes(contentType)) {
      throw new Error(
        `Unsupported image type "${contentType}". Only JPEG, PNG, and WebP are allowed.`,
      );
    }

    return this.uploadOptimised(fileBuffer, restaurantId);
  }

  /**
   * Core image processing + upload pipeline.
   */
  private async uploadOptimised(
    fileBuffer: Buffer,
    restaurantId: string,
  ): Promise<ProcessedUpload> {
    const id = randomBytes(16).toString('hex');
    const prefix = StorageService.tenantPrefix(restaurantId);
    const mainKey = `${prefix}${id}.webp`;
    const thumbKey = `${prefix}${id}_thumb.webp`;

    // Get metadata to log savings
    const originalSize = fileBuffer.length;
    const metadata = await sharp(fileBuffer).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    // --- Main image: resize + WebP ---
    // limitInputPixels caps decompression to 200MP (150M is sharp default; 200M
    // = 14142×14142px which covers all realistic restaurant photos). Guards
    // against decompression-bomb payloads that would OOM the process.
    const mainBuffer = await sharp(fileBuffer, {
      limitInputPixels: 200_000_000,
    })
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
    const thumbBuffer = await sharp(fileBuffer, {
      limitInputPixels: 200_000_000,
    })
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
      this.circuit.execute(
        () =>
          this.s3.send(
            new PutObjectCommand({
              Bucket: this.bucket,
              Key: mainKey,
              Body: mainBuffer,
              ContentType: 'image/webp',
              CacheControl: 'public, max-age=31536000, immutable',
            }),
            { abortSignal: requestBudgetSignal() },
          ),
        { error: classifyProviderError },
      ),
      this.circuit.execute(
        () =>
          this.s3.send(
            new PutObjectCommand({
              Bucket: this.bucket,
              Key: thumbKey,
              Body: thumbBuffer,
              ContentType: 'image/webp',
              CacheControl: 'public, max-age=31536000, immutable',
            }),
            { abortSignal: requestBudgetSignal() },
          ),
        { error: classifyProviderError },
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
  /**
   * Objects are written under `tenants/{restaurantId}/`.
   *
   * This is isolation and operations, NOT confidentiality: per-tenant lifecycle
   * rules, bulk purge on offboarding, comprehensible storage costs, and a blast
   * radius on a bad delete. The bucket is publicly readable, so the prefix
   * conceals nothing from anyone already holding a URL -- do not mistake it for
   * an access control.
   */
  private static tenantPrefix(restaurantId: string): string {
    return `tenants/${encodeURIComponent(restaurantId)}/`;
  }

  /**
   * Resolve a stored URL (or raw key) to the object key it refers to.
   *
   * Returns the FULL key, not the final path segment. Reducing
   * `tenants/rest-2/abc.webp` to `abc.webp` would silently address a different
   * object -- and with namespacing that is the difference between deleting a
   * tenant's image and deleting whatever legacy object happens to share the
   * name.
   */
  private extractManagedKey(keyOrUrl: string): string | null {
    if (!/^https?:\/\//i.test(keyOrUrl)) {
      return this.rejectTraversal(keyOrUrl);
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

      // Strip the bucket's own base path, keeping everything below it.
      const key = decodeURIComponent(
        fileUrl.pathname.slice(storagePath.length).replace(/^\//, ''),
      );
      return this.rejectTraversal(key);
    } catch {
      return null;
    }
  }

  /**
   * Keeping the full path means `..` must be refused explicitly -- previously
   * taking the basename made traversal impossible by accident rather than by
   * design.
   */
  private rejectTraversal(key: string): string | null {
    if (!key || key.startsWith('/') || key.split('/').includes('..')) {
      return null;
    }
    return key;
  }

  /**
   * Whether `key` may be operated on by `restaurantId`.
   *
   * A key with no tenant prefix predates namespacing. Those objects are
   * deliberately left in place -- no destructive migration -- so refusing them
   * here would make every existing menu image permanently undeletable.
   */
  private isOwnedBy(key: string, restaurantId: string): boolean {
    // TypeScript catches missing ids in application callers; this runtime guard
    // keeps the boundary closed for JavaScript, stale builds, or future dynamic
    // invocation as well. Legacy keys are compatible only with an authenticated,
    // server-derived tenant id -- never with no tenant context at all.
    if (!restaurantId?.trim()) return false;
    if (!key.startsWith('tenants/')) return true;
    return key.startsWith(StorageService.tenantPrefix(restaurantId));
  }

  /** Whether a managed URL/key belongs to the post-P2-6 tenant namespace. */
  isTenantNamespacedObject(keyOrUrl: string): boolean {
    return this.extractManagedKey(keyOrUrl)?.startsWith('tenants/') ?? false;
  }

  async deleteExact(keyOrUrl: string, restaurantId: string): Promise<void> {
    const key = this.extractManagedKey(keyOrUrl);
    if (!key) {
      this.logger.warn(`Skipping unmanaged image URL: ${keyOrUrl}`);
      return;
    }
    if (!this.isOwnedBy(key, restaurantId)) {
      this.logger.warn(
        `Refusing cross-tenant delete of ${key} requested by ${restaurantId}`,
      );
      return;
    }

    try {
      await this.circuit.execute(
        () =>
          this.s3.send(
            new DeleteObjectCommand({
              Bucket: this.bucket,
              Key: key,
            }),
            { abortSignal: requestBudgetSignal() },
          ),
        { error: classifyProviderError },
      );
      this.logger.log(`Deleted: ${key}`);
    } catch (error) {
      this.logger.warn(`Failed to delete ${key}: ${error}`);
    }
  }

  async delete(keyOrUrl: string, restaurantId: string): Promise<void> {
    const key = this.extractManagedKey(keyOrUrl);
    if (!key) {
      this.logger.warn(`Skipping unmanaged image URL: ${keyOrUrl}`);
      return;
    }
    if (!this.isOwnedBy(key, restaurantId)) {
      this.logger.warn(
        `Refusing cross-tenant delete of ${key} requested by ${restaurantId}`,
      );
      return;
    }

    try {
      // Delete both main image and its derived thumbnail variant. Callers that
      // already know the exact DB column URL should use deleteExact() to avoid
      // deleting an unchanged thumbnail still referenced by another row.
      await Promise.all([
        this.deleteExact(key, restaurantId),
        this.deleteExact(
          key.replace(/\.[^/.]+$/, '') + '_thumb.webp',
          restaurantId,
        ),
      ]);
      this.logger.log(`Deleted: ${key} (+ thumbnail)`);
    } catch (error) {
      this.logger.warn(`Failed to delete ${key}: ${error}`);
    }
  }

  /**
   * Permanently remove every post-namespacing object owned by one tenant.
   *
   * This is intentionally a service capability, not part of soft-delete:
   * restaurants can currently be restored, so calling this from that path would
   * turn a reversible account action into irreversible data loss. A future hard
   * erasure/offboarding workflow may call it explicitly after its own checks.
   * Legacy un-namespaced objects cannot be attributed safely and are excluded.
   */
  async purgeTenant(restaurantId: string): Promise<number> {
    if (!restaurantId.trim()) {
      throw new Error('restaurantId is required for tenant storage purge');
    }

    const prefix = StorageService.tenantPrefix(restaurantId);
    let continuationToken: string | undefined;
    let deleted = 0;

    do {
      const page = await this.circuit.execute(
        () =>
          this.s3.send(
            new ListObjectsV2Command({
              Bucket: this.bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }),
            { abortSignal: requestBudgetSignal() },
          ),
        { error: classifyProviderError },
      );
      const objects = (page.Contents ?? [])
        .map(({ Key }) => Key)
        .filter((key): key is string => Boolean(key))
        .map((Key) => ({ Key }));

      if (objects.length > 0) {
        const result = await this.circuit.execute(
          () =>
            this.s3.send(
              new DeleteObjectsCommand({
                Bucket: this.bucket,
                Delete: { Objects: objects, Quiet: true },
              }),
              { abortSignal: requestBudgetSignal() },
            ),
          { error: classifyProviderError },
        );
        if (result.Errors?.length) {
          throw new Error(
            `R2 tenant purge failed for ${result.Errors.length} object(s)`,
          );
        }
        deleted += objects.length;
      }

      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
      if (page.IsTruncated && !continuationToken) {
        throw new Error('R2 tenant purge page was truncated without a cursor');
      }
    } while (continuationToken);

    this.logger.log(`Purged ${deleted} object(s) for tenant ${restaurantId}`);
    return deleted;
  }
}
