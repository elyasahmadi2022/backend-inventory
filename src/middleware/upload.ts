import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { AppError } from "../utils/app-error.js";

export const uploadRoot =
  process.env.VERCEL === "1"
    ? path.join("/tmp", "uploads")
    : path.resolve(process.cwd(), "uploads");

function ensureDirectory(directory: string) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function imageStorage(folder: string) {
  const destination = path.join(uploadRoot, folder);
  ensureDirectory(destination);

  return multer.diskStorage({
    destination,
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const filename = `${Date.now()}-${cryptoRandom()}${extension}`;
      callback(null, filename);
    }
  });
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10);
}

function imageFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
    callback(new AppError(400, "Only JPG, PNG, and WEBP images are allowed"));
    return;
  }

  callback(null, true);
}

export function imageUpload(folder: string) {
  return multer({
    storage: imageStorage(folder),
    fileFilter: imageFileFilter,
    limits: {
      fileSize: 2 * 1024 * 1024
    }
  });
}

export function publicUploadPath(file?: Express.Multer.File) {
  if (!file) {
    return undefined;
  }

  const relativePath = path.relative(uploadRoot, file.path).replace(/\\/g, "/");
  return `/uploads/${relativePath}`;
}
