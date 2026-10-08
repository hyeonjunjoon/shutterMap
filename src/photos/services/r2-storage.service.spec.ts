import { Test } from '@nestjs/testing';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { R2StorageService, S3_CLIENT } from './r2-storage.service';

describe('R2StorageService', () => {
  let service: R2StorageService;
  let client: { send: jest.Mock };

  beforeEach(async () => {
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example.com';
    process.env.R2_ORIGINAL_BUCKET_NAME = 'test-private-bucket';
    client = { send: jest.fn().mockResolvedValue({}) };
    const moduleRef = await Test.createTestingModule({
      providers: [R2StorageService, { provide: S3_CLIENT, useValue: client }],
    }).compile();
    service = moduleRef.get(R2StorageService);
  });

  it('uploads the buffer with the given key, bucket, and content type', async () => {
    await service.uploadBuffer('photos/u1/p1/original.jpg', Buffer.from('abc'), 'image/jpeg');

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'test-bucket',
      Key: 'photos/u1/p1/original.jpg',
      Body: Buffer.from('abc'),
      ContentType: 'image/jpeg',
    });
  });

  it('builds a public url by joining the base url and key', () => {
    expect(service.buildPublicUrl('photos/u1/p1/thumbnail.jpg')).toBe(
      'https://cdn.example.com/photos/u1/p1/thumbnail.jpg',
    );
  });

  it('uploads the original to the private bucket, not the public one', async () => {
    await service.uploadOriginal('photos/u1/p1/original.jpg', Buffer.from('abc'), 'image/jpeg');

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0][0] as PutObjectCommand;
    expect(command.input).toEqual({
      Bucket: 'test-private-bucket',
      Key: 'photos/u1/p1/original.jpg',
      Body: Buffer.from('abc'),
      ContentType: 'image/jpeg',
    });
  });
});
