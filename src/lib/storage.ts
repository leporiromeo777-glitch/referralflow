import 'server-only';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const useS3 = !!process.env.S3_ENDPOINT && !!process.env.S3_BUCKET;

const s3 = useS3
  ? new S3Client({
      region: process.env.S3_REGION ?? 'ch-dk-2',
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
      },
      forcePathStyle: true,
    })
  : null;

const LOCAL_DIR = path.join(process.cwd(), 'uploads');

export async function putFile(buffer: Buffer, contentType: string, ext: string): Promise<string> {
  const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;
  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // Cifratura at-rest dichiarata (SSE, AES-256) — attiva con S3_SSE=AES256
        // nel .env di produzione, dopo la verifica che il provider la accetti.
        ...(process.env.S3_SSE ? { ServerSideEncryption: process.env.S3_SSE as 'AES256' } : {}),
      })
    );
  } else {
    const full = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
  }
  return key;
}

// Cancellazione definitiva (es. eliminazione di una bozza scartata con il suo
// audio). Best-effort: un file già assente non è un errore.
export async function deleteFile(key: string): Promise<void> {
  if (s3) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    } catch (e: any) {
      console.error('Cancellazione storage fallita:', e?.name ?? 'errore');
    }
    return;
  }
  try {
    await fs.unlink(path.join(LOCAL_DIR, key));
  } catch {
    /* già assente */
  }
}

export async function getFile(key: string): Promise<{ body: Buffer; contentType?: string }> {
  if (s3) {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })
    );
    const bytes = await res.Body!.transformToByteArray();
    return { body: Buffer.from(bytes), contentType: res.ContentType };
  }
  const full = path.join(LOCAL_DIR, key);
  const body = await fs.readFile(full);
  return { body };
}
