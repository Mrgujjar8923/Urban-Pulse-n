import fs from "fs";
import path from "path";
import crypto from "crypto";

const DEFAULT_UPLOAD_BASE = path.resolve(process.cwd(), "uploads");
const COMPLAINTS_SUBDIR = "complaints";

export const detectImageSignature = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // 1. JPEG check: starts with FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      mimeType: "image/jpeg",
      extension: ".jpg",
    };
  }

  // 2. PNG check: starts with 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      mimeType: "image/png",
      extension: ".png",
    };
  }

  // 3. WebP check: RIFF....WEBP
  // Bytes 0-3: 52 49 46 46 ('RIFF')
  // Bytes 8-11: 57 45 42 50 ('WEBP')
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return {
      mimeType: "image/webp",
      extension: ".webp",
    };
  }

  return null;
};

export const getStorageRootDir = () => {
  return process.env.EVIDENCE_UPLOAD_DIR
    ? path.resolve(process.env.EVIDENCE_UPLOAD_DIR)
    : DEFAULT_UPLOAD_BASE;
};

export const isSafeStorageKey = (storageKey) => {
  if (typeof storageKey !== "string" || !storageKey.trim()) return false;
  // Disallow null bytes, path traversal sequences
  if (storageKey.includes("\0") || storageKey.includes("..")) return false;
  // Must start with complaints/ or subpath, no absolute paths
  if (path.isAbsolute(storageKey)) return false;
  // Ensure normalized path does not escape base directory
  const root = getStorageRootDir();
  const resolved = path.resolve(root, storageKey);
  const relative = path.relative(root, resolved);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
};

class LocalEvidenceStorageDriver {
  constructor() {
    this.name = "local";
  }

  ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  async uploadEvidenceFile(buffer, metadata = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error("Invalid or empty file buffer provided.");
    }

    const signature = detectImageSignature(buffer);
    if (!signature) {
      throw new Error("Invalid file content. Only JPEG, PNG, and WebP images are permitted.");
    }

    const uuid = crypto.randomUUID();
    const filename = `${uuid}${signature.extension}`;
    const storageKey = path.posix.join(COMPLAINTS_SUBDIR, filename);

    const rootDir = getStorageRootDir();
    const complaintsDir = path.join(rootDir, COMPLAINTS_SUBDIR);
    this.ensureDirectory(complaintsDir);

    const targetPath = path.join(complaintsDir, filename);
    await fs.promises.writeFile(targetPath, buffer);

    return {
      storageKey,
      filename,
      mimeType: signature.mimeType,
      size: buffer.length,
      driver: this.name,
      uploadedAt: new Date().toISOString(),
      metadata,
    };
  }

  async getEvidenceFile(storageKey) {
    if (!isSafeStorageKey(storageKey)) {
      return null;
    }

    const rootDir = getStorageRootDir();
    const targetPath = path.resolve(rootDir, storageKey);

    if (!fs.existsSync(targetPath)) {
      return null;
    }

    const stat = await fs.promises.stat(targetPath);
    if (!stat.isFile()) {
      return null;
    }

    const buffer = await fs.promises.readFile(targetPath);
    const signature = detectImageSignature(buffer);
    if (!signature) {
      return null;
    }

    return {
      storageKey,
      buffer,
      mimeType: signature.mimeType,
      size: stat.size,
      updatedAt: stat.mtime,
    };
  }

  async deleteEvidenceFile(storageKey) {
    if (!isSafeStorageKey(storageKey)) {
      return false;
    }

    const rootDir = getStorageRootDir();
    const targetPath = path.resolve(rootDir, storageKey);

    if (!fs.existsSync(targetPath)) {
      return false;
    }

    try {
      await fs.promises.unlink(targetPath);
      return true;
    } catch (err) {
      console.error("[EvidenceStorage] Failed to delete file", storageKey, err.message);
      return false;
    }
  }
}

// Default driver instance
let currentDriver = new LocalEvidenceStorageDriver();

export const setStorageDriver = (driver) => {
  currentDriver = driver;
};

export const getStorageDriver = () => currentDriver;

export const uploadEvidenceFile = (buffer, metadata) => currentDriver.uploadEvidenceFile(buffer, metadata);
export const getEvidenceFile = (storageKey) => currentDriver.getEvidenceFile(storageKey);
export const deleteEvidenceFile = (storageKey) => currentDriver.deleteEvidenceFile(storageKey);

