import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { saveUpload, VIDEO_MAX_BYTES } from '../services/storage.service';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/response';

export const uploadRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX_BYTES, files: 1 },
});

/** Any signed-in user may upload one file; the real type is sniffed server-side. */
uploadRouter.post('/', authenticate(), (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(
        err.code === 'LIMIT_FILE_SIZE'
          ? new AppError(413, 'FILE_TOO_LARGE', 'File is too large')
          : AppError.badRequest('Upload failed', 'UPLOAD_FAILED'),
      );
    }
    if (err) return next(err);
    if (!req.file) return next(AppError.badRequest('Choose a file to upload', 'NO_FILE'));
    // ?private=1 → KYC document (image or PDF), stored outside the public folder.
    const isPrivate = req.query.private === '1';
    const allowed = isPrivate ? 'document' : req.query.kind === 'image' ? 'image' : 'any';
    saveUpload(req.file.buffer, allowed, { private: isPrivate })
      .then((result) => ok(res, result, 201))
      .catch(next);
  });
});
