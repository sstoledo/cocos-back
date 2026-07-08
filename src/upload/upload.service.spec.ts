import type { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { UploadService } from './upload.service';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn(),
    },
  },
}));

describe('UploadService', () => {
  let service: UploadService;
  let configService: ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          CLOUDINARY_CLOUD_NAME: 'cloud-name',
          CLOUDINARY_API_KEY: 'api-key',
          CLOUDINARY_API_SECRET: 'api-secret',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    service = new UploadService(configService);
  });

  it('uploadImage returns url and publicId', async () => {
    const buffer = Buffer.from('image-data');
    const expectedUrl = 'https://cloudinary.test/folder/image.png';
    const expectedPublicId = 'folder/image';

    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_options, callback) => {
        callback(null, {
          secure_url: expectedUrl,
          public_id: expectedPublicId,
        });
        return { on: jest.fn(), end: jest.fn() };
      }
    );

    const result = await service.uploadImage(buffer, 'folder');

    expect(result).toEqual({ url: expectedUrl, publicId: expectedPublicId });
    expect(cloudinary.config).toHaveBeenCalledWith({
      cloud_name: 'cloud-name',
      api_key: 'api-key',
      api_secret: 'api-secret',
    });
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'folder' }),
      expect.any(Function)
    );
  });

  it('deleteImage calls destroy with the public id', async () => {
    (cloudinary.uploader.destroy as jest.Mock).mockImplementation(
      (_publicId, callback) => {
        callback(null, { result: 'ok' });
      }
    );

    await service.deleteImage('public-id');

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      'public-id',
      expect.any(Function)
    );
  });

  it('propagates delete errors as thrown exceptions', async () => {
    (cloudinary.uploader.destroy as jest.Mock).mockImplementation(
      (_publicId, callback) => {
        callback(new Error('Destroy failed'), null);
      }
    );

    await expect(service.deleteImage('public-id')).rejects.toThrow(
      'Destroy failed'
    );
  });

  it('propagates upload errors as thrown exceptions', async () => {
    const buffer = Buffer.from('image-data');

    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_options, callback) => {
        callback(new Error('Upload failed'), null);
        return { on: jest.fn(), end: jest.fn() };
      }
    );

    await expect(service.uploadImage(buffer, 'folder')).rejects.toThrow(
      'Upload failed'
    );
  });
});
