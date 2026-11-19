import multer from "multer";
import { detectImageSignature } from "../services/evidenceStorage.service.js";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

const uploadSingleEvidence = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "evidence", maxCount: 1 },
]);

export const complaintUploadMiddleware = (req, res, next) => {
  if (!req.is("multipart/form-data")) {
    return next();
  }

  uploadSingleEvidence(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            message: "File size exceeds maximum allowed limit of 5 MB.",
          });
        }
        if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            message: "Only a single evidence image is allowed under the 'image' or 'evidence' field.",
          });
        }
        return res.status(400).json({
          message: err.message || "Invalid upload parameters.",
        });
      }
      return res.status(400).json({
        message: err.message || "Failed to process uploaded file.",
      });
    }

    if (req.files) {
      if (req.files.image && req.files.evidence) {
        return res.status(400).json({
          message: "Only a single evidence image is allowed.",
        });
      }
      req.file = req.files.image?.[0] || req.files.evidence?.[0] || null;
    }

    if (req.file) {
      // Validate magic bytes/file signature
      const signature = detectImageSignature(req.file.buffer);
      if (!signature) {
        return res.status(400).json({
          message: "Invalid file type. Only JPEG, PNG, and WebP images are allowed.",
        });
      }

      req.file.verifiedMimeType = signature.mimeType;
      req.file.verifiedExtension = signature.extension;
    }

    next();
  });
};

