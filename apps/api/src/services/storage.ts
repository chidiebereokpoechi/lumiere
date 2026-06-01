import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../lib/config';

const base = {
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
};

// Internal: app → NAS over LAN. Used for Put/Delete/List.
const s3 = new S3Client({ ...base, endpoint: env.S3_ENDPOINT_INTERNAL });

// Presign-only: produces browser-facing URLs. SigV4 binds to Host, so this MUST
// sign against the public host the browser will actually reach.
const s3Public = new S3Client({ ...base, endpoint: env.S3_ENDPOINT_PUBLIC });

export async function uploadObject(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

export async function deletePrefix(prefix: string): Promise<void> {
  let continuationToken: string | undefined;
  do {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: env.S3_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    const keys = (list.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
    if (keys.length > 0) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: env.S3_BUCKET,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }));
    }
    continuationToken = list.NextContinuationToken;
  } while (continuationToken);
}

export function presignGet(key: string, expiresIn = env.PRESIGN_TTL_SECONDS): Promise<string> {
  return getSignedUrl(
    s3Public,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    { expiresIn },
  );
}

/**
 * Like presignGet, but sets ResponseContentDisposition so the browser saves the
 * file with the requested filename. SigV4 covers the response-header params
 * since they're part of the signed query string.
 */
export function presignDownload(
  key: string,
  filename: string,
  expiresIn = env.PRESIGN_TTL_SECONDS,
): Promise<string> {
  const safe = filename.replace(/["\\\r\n]/g, '_');
  return getSignedUrl(
    s3Public,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safe}"`,
    }),
    { expiresIn },
  );
}

/** Fetch an object's body as a Node Readable — used by the ZIP builder. */
export async function getObjectStream(key: string): Promise<NodeJS.ReadableStream> {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  if (!res.Body) throw new Error(`empty body for ${key}`);
  return res.Body as NodeJS.ReadableStream;
}

export async function checkS3(): Promise<boolean> {
  try {
    await s3.send(new ListObjectsV2Command({ Bucket: env.S3_BUCKET, MaxKeys: 1 }));
    return true;
  } catch {
    return false;
  }
}
