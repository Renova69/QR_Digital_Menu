import { StorageService } from './storage.service';
import { ConfigService } from '@nestjs/config';

const mockSharpChain = {
  rotate: jest.fn().mockReturnThis(),
  resize: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('img-data')),
  metadata: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
};

// Factory must not reference outer const vars (temporal dead zone after hoist)
jest.mock('sharp', () => jest.fn());

const mockS3Send = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

const mockConfigService = {
  get: (key: string, defaultVal?: string): string => {
    const cfg: Record<string, string> = {
      R2_ACCOUNT_ID: 'acc-123',
      R2_ACCESS_KEY_ID: 'key-abc',
      R2_SECRET_ACCESS_KEY: 'sec-xyz',
      R2_BUCKET_NAME: 'test-bucket',
      R2_PUBLIC_URL: 'https://cdn.example.com',
    };
    return cfg[key] ?? defaultVal ?? '';
  },
};

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Wire sharp mock to return our chain — must be done after jest.clearAllMocks

    (require('sharp') as jest.Mock).mockReturnValue(mockSharpChain);
    mockSharpChain.toBuffer.mockResolvedValue(Buffer.from('img-data'));
    mockSharpChain.metadata.mockResolvedValue({ width: 800, height: 600 });
    mockS3Send.mockResolvedValue({});
    service = new StorageService(mockConfigService as unknown as ConfigService);
  });

  describe('upload', () => {
    it('throws for unsupported MIME type (gif)', async () => {
      await expect(
        service.upload(Buffer.from('data'), 'file.gif', 'image/gif',
        'rest-1'),
      ).rejects.toThrow('Unsupported image type');
    });

    it('returns a .webp URL for JPEG upload', async () => {
      const url = await service.upload(
        Buffer.from('data'),
        'photo.jpg',
        'image/jpeg',
        'rest-1',
      );
      expect(url).toMatch(/^https:\/\/cdn\.example\.com\//);
      expect(url).toMatch(/\.webp$/);
    });

    it('accepts PNG MIME type', async () => {
      const url = await service.upload(
        Buffer.from('data'),
        'photo.png',
        'image/png',
        'rest-1',
      );
      expect(url).toBeTruthy();
    });

    it('accepts WebP MIME type', async () => {
      const url = await service.upload(
        Buffer.from('data'),
        'photo.webp',
        'image/webp',
        'rest-1',
      );
      expect(url).toBeTruthy();
    });

    it('calls S3 send twice (main + thumbnail) per upload', async () => {
      await service.upload(Buffer.from('data'), 'photo.jpg', 'image/jpeg',
        'rest-1');
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });
  });

  describe('uploadWithThumbnail', () => {
    it('throws for unsupported MIME type (bmp)', async () => {
      await expect(
        service.uploadWithThumbnail(
          Buffer.from('data'),
          'file.bmp',
          'image/bmp',
          'rest-1',
        ),
      ).rejects.toThrow('Unsupported image type');
    });

    it('returns url and thumbnailUrl for JPEG', async () => {
      const result = await service.uploadWithThumbnail(
        Buffer.from('data'),
        'photo.jpg',
        'image/jpeg',
        'rest-1',
      );
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('thumbnailUrl');
      expect(result.url).toMatch(/\.webp$/);
      expect(result.thumbnailUrl).toMatch(/_thumb\.webp$/);
    });

    it('thumbnailUrl is different key than url', async () => {
      const result = await service.uploadWithThumbnail(
        Buffer.from('data'),
        'photo.png',
        'image/png',
        'rest-1',
      );
      expect(result.url).not.toBe(result.thumbnailUrl);
    });
  });

  describe('tenant namespacing', () => {
    const png = 'image/png';

    // Namespacing is isolation and operations -- per-tenant lifecycle rules,
    // bulk purge, comprehensible storage bills, and blast radius on a bad
    // delete. It is NOT confidentiality: the bucket is public, so the prefix
    // conceals nothing from anyone holding a URL.
    it('writes objects under the owning tenant prefix', async () => {
      const { url, thumbnailUrl } = await service.uploadWithThumbnail(
        Buffer.from('x'),
        'a.png',
        png,
        'rest-1',
      );

      expect(url).toContain('/tenants/rest-1/');
      expect(thumbnailUrl).toContain('/tenants/rest-1/');
      expect(thumbnailUrl).toMatch(/_thumb\.webp$/);
    });

    // Two tenants uploading a file with the same name must never collide. The
    // random id already prevents that, but the prefix means a collision would
    // be scoped to one tenant even if id generation were ever weakened.
    it('keeps identical filenames from different tenants apart', async () => {
      const a = await service.uploadWithThumbnail(
        Buffer.from('x'),
        'logo.png',
        png,
        'rest-1',
      );
      const b = await service.uploadWithThumbnail(
        Buffer.from('x'),
        'logo.png',
        png,
        'rest-2',
      );

      expect(a.url).toContain('/tenants/rest-1/');
      expect(b.url).toContain('/tenants/rest-2/');
      expect(a.url).not.toBe(b.url);
    });

    it('refuses to delete an object belonging to another tenant', async () => {
      await service.deleteExact(
        'https://cdn.example.com/tenants/rest-2/abc.webp',
        'rest-1',
      );

      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('deletes an object belonging to the requesting tenant', async () => {
      await service.deleteExact(
        'https://cdn.example.com/tenants/rest-1/abc.webp',
        'rest-1',
      );

      expect(mockS3Send).toHaveBeenCalled();
    });

    // Objects uploaded before namespacing have no tenant in their key. They are
    // deliberately left in place -- no destructive migration -- so deletion has
    // to keep working for them or existing menu images become unremovable.
    it('still deletes a legacy un-namespaced object', async () => {
      await service.deleteExact(
        'https://cdn.example.com/abc123.webp',
        'rest-1',
      );

      expect(mockS3Send).toHaveBeenCalled();
    });

    // The key used to be reduced to its last path segment, which would silently
    // rewrite tenants/rest-2/abc.webp to abc.webp and delete the wrong object.
    it('preserves the full key path rather than the basename', async () => {
      await service.deleteExact(
        'https://cdn.example.com/tenants/rest-1/abc.webp',
        'rest-1',
      );

      const sentKey = (
        require('@aws-sdk/client-s3').DeleteObjectCommand as jest.Mock
      ).mock.calls[0][0].Key;
      expect(sentKey).toBe('tenants/rest-1/abc.webp');
    });
  });

  describe('delete', () => {
    it('deletes by plain key (no URL prefix)', async () => {
      await service.delete('abc123.webp');
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('deleteExact deletes only the provided managed key', async () => {
      await service.deleteExact('abc123.webp');
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('extracts key from full https URL', async () => {
      await service.delete('https://cdn.example.com/abc123.webp');
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('does not delete external image URLs', async () => {
      await service.delete('https://images.example.net/abc123.webp');
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('swallows S3 errors on delete failure', async () => {
      mockS3Send.mockRejectedValueOnce(new Error('S3 error'));
      await expect(service.delete('missing.webp')).resolves.toBeUndefined();
    });

    it('handles metadata with zero width/height', async () => {
      mockSharpChain.metadata.mockResolvedValue({
        width: undefined,
        height: undefined,
      });
      const url = await service.upload(
        Buffer.from('data'),
        'photo.jpg',
        'image/jpeg',
        'rest-1',
      );
      expect(url).toBeTruthy();
    });
  });
});
