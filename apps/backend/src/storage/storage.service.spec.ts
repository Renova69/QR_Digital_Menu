import { StorageService } from './storage.service';

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
    service = new StorageService(mockConfigService as any);
  });

  describe('upload', () => {
    it('throws for unsupported MIME type (gif)', async () => {
      await expect(
        service.upload(Buffer.from('data'), 'file.gif', 'image/gif'),
      ).rejects.toThrow('Unsupported image type');
    });

    it('returns a .webp URL for JPEG upload', async () => {
      const url = await service.upload(
        Buffer.from('data'),
        'photo.jpg',
        'image/jpeg',
      );
      expect(url).toMatch(/^https:\/\/cdn\.example\.com\//);
      expect(url).toMatch(/\.webp$/);
    });

    it('accepts PNG MIME type', async () => {
      const url = await service.upload(
        Buffer.from('data'),
        'photo.png',
        'image/png',
      );
      expect(url).toBeTruthy();
    });

    it('accepts WebP MIME type', async () => {
      const url = await service.upload(
        Buffer.from('data'),
        'photo.webp',
        'image/webp',
      );
      expect(url).toBeTruthy();
    });

    it('calls S3 send twice (main + thumbnail) per upload', async () => {
      await service.upload(Buffer.from('data'), 'photo.jpg', 'image/jpeg');
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
        ),
      ).rejects.toThrow('Unsupported image type');
    });

    it('returns url and thumbnailUrl for JPEG', async () => {
      const result = await service.uploadWithThumbnail(
        Buffer.from('data'),
        'photo.jpg',
        'image/jpeg',
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
      );
      expect(result.url).not.toBe(result.thumbnailUrl);
    });
  });

  describe('delete', () => {
    it('deletes by plain key (no URL prefix)', async () => {
      await service.delete('abc123.webp');
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('extracts key from full https URL', async () => {
      await service.delete('https://cdn.example.com/abc123.webp');
      expect(mockS3Send).toHaveBeenCalled();
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
      );
      expect(url).toBeTruthy();
    });
  });
});
