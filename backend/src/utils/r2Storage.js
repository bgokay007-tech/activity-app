// Cloudflare R2 (S3 uyumlu). Maç videoları büyük olduğu için istemci doğrudan R2'ye yükler
// (presigned PUT); sunucu yalnız imzalı URL üretir, ffmpeg de imzalı GET URL'den akıtarak okur.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// env, dotenv yüklendikten sonra okunsun diye çağrı anında
const env = () => ({
    account: process.env.R2_ACCOUNT_ID,
    key: process.env.R2_ACCESS_KEY_ID,
    secret: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
});

export const r2Configured = () => {
    const e = env();
    return !!(e.account && e.key && e.secret && e.bucket);
};

let client = null;
function s3() {
    if (!r2Configured()) throw Object.assign(new Error('R2 storage is not configured'), { code: 'R2_NOT_CONFIGURED' });
    if (!client) {
        const e = env();
        client = new S3Client({
            region: 'auto',
            endpoint: `https://${e.account}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId: e.key, secretAccessKey: e.secret },
        });
    }
    return client;
}

export const presignPut = (key, contentType = 'video/mp4', expiresIn = 6 * 3600) =>
    getSignedUrl(s3(), new PutObjectCommand({ Bucket: env().bucket, Key: key, ContentType: contentType }), { expiresIn });

export const presignGet = (key, expiresIn = 6 * 3600) =>
    getSignedUrl(s3(), new GetObjectCommand({ Bucket: env().bucket, Key: key }), { expiresIn });

export async function headObject(key) {
    try {
        const r = await s3().send(new HeadObjectCommand({ Bucket: env().bucket, Key: key }));
        return { size: Number(r.ContentLength) || 0 };
    } catch {
        return null;
    }
}

export async function deleteObject(key) {
    try { await s3().send(new DeleteObjectCommand({ Bucket: env().bucket, Key: key })); } catch { /* yok say */ }
}
