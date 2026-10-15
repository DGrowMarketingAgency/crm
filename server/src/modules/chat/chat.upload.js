import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const uploadDir = path.resolve('uploads', 'chat');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueKey = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;
    cb(null, uniqueKey);
  }
});

const allowedMimeTypes = [
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  // Media
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/webm'
];

const disallowedExtensions = [
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.php', '.js', '.mjs', '.cjs',
  '.vbs', '.py', '.rb', '.pl', '.cgi', '.jar', '.com', '.scr', '.pif', '.msi'
];

export const chatAttachmentUpload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (disallowedExtensions.includes(ext)) {
      const error = new Error(`Executable and script files (${ext}) are strictly blocked for security.`);
      error.status = 400;
      error.code = 'DISALLOWED_FILE_TYPE';
      return cb(error);
    }

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const error = new Error(`Unsupported file type: ${file.mimetype}. Allowed types include standard images, documents, audio/video, and archives.`);
      error.status = 415;
      error.code = 'UNSUPPORTED_MEDIA_TYPE';
      cb(error);
    }
  }
});

export { uploadDir };
