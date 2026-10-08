import { Inject, Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { requireEnv } from '../../common/require-env';

export const S3_CLIENT = 'S3_CLIENT';

export function createR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

@Injectable()
export class R2StorageService {
  private readonly bucket = requireEnv('R2_BUCKET_NAME');
  private readonly publicBaseUrl = requireEnv('R2_PUBLIC_BASE_URL');

  constructor(@Inject(S3_CLIENT) private readonly client: S3Client) {}

  async uploadBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  buildPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }
}
