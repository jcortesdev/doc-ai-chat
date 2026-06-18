import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// Lazy so importing this module never throws at build time when env is absent.
let cachedClient: S3Client | undefined;

function r2Client(): S3Client {
  if (!cachedClient) {
    const accountId = requireEnv('R2_ACCOUNT_ID');
    cachedClient = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
      // AWS SDK v3 bakes a CRC32 checksum into presigned URLs by default, which
      // breaks browser PUTs against R2. Only add checksums when required.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return cachedClient;
}

export function r2Bucket(): string {
  return requireEnv('R2_BUCKET');
}

export async function getSignedUploadUrl({
  key,
  contentType,
  expiresInSeconds,
}: {
  key: string;
  contentType: string;
  expiresInSeconds: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client(), command, { expiresIn: expiresInSeconds });
}

// Downloads an object's bytes (used by the ingest pipeline to read the PDF).
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const response = await r2Client().send(new GetObjectCommand({ Bucket: r2Bucket(), Key: key }));
  if (!response.Body) {
    throw new Error(`R2 object not found: ${key}`);
  }
  return response.Body.transformToByteArray();
}
