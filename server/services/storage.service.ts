import path from 'path';
import { promises as fs } from 'fs';
import { env } from '../config/env.js';

/** Resolve a stored relative file_path ("<sha>.pdf") to an absolute path. */
export function absolutePathForFile(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(env.studyMaterialsDir, filePath);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(absolutePathForFile(filePath));
    return true;
  } catch {
    return false;
  }
}

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export function extForMime(mime: string): string {
  return MIME_EXT[mime] ?? 'pdf';
}
