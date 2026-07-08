import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface UploadedImage {
  url: string;
  publicId: string;
}

@Injectable()
export class UploadService {
  constructor(private readonly config: ConfigService) {
    this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    this.config.get<string>('CLOUDINARY_API_KEY');
    this.config.get<string>('CLOUDINARY_API_SECRET');
  }

  uploadImage(_buffer: Buffer, _folder: string): Promise<UploadedImage> {
    return Promise.reject(new Error('UploadService not implemented'));
  }

  deleteImage(_publicId: string): Promise<void> {
    return Promise.reject(new Error('UploadService not implemented'));
  }
}
