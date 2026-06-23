import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { authenticate } from '../middlewares/auth.middleware.js';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    fileFilter: (req, file, cb) => {
        const allowed = /image\/(jpeg|png|gif|webp|heic|heif)|video\/(mp4|webm|quicktime)|application\/pdf/;
        cb(null, allowed.test(file.mimetype));
    },
});

const router = Router();

router.post('/', authenticate, upload.single('file'), async (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    try {
        const isVideo = req.file.mimetype.startsWith('video');
        const isPdf = req.file.mimetype === 'application/pdf';
        const resourceType = isVideo ? 'video' : isPdf ? 'raw' : 'image';

        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { resource_type: resourceType, folder: 'activity-app' },
                (error, result) => { if (error) reject(error); else resolve(result); }
            );
            stream.end(req.file.buffer);
        });

        res.json({ url: result.secure_url, type: isVideo ? 'video' : isPdf ? 'pdf' : 'image' });
    } catch (error) {
        next(error);
    }
});

export default router;
