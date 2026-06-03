import { z } from 'zod';

export const FolderCreateInput = z.object({
  name: z.string().min(1).max(120),
}).strict();
export type FolderCreateInput = z.infer<typeof FolderCreateInput>;

export const FolderPatchInput = z.object({
  name: z.string().min(1).max(120),
  position: z.number().int().min(0),
  hidden: z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => (v ? 1 : 0)),
  coverFileId: z.string().nullable(),
}).partial().strict();
export type FolderPatchInput = z.infer<typeof FolderPatchInput>;

// Reorder folders: position becomes each id's index in the array.
export const FolderReorderInput = z.object({
  folderIds: z.array(z.string().min(1)).min(1),
}).strict();
export type FolderReorderInput = z.infer<typeof FolderReorderInput>;

// Bulk-assign files to a folder.
export const FileMoveInput = z.object({
  fileIds: z.array(z.string().min(1)).min(1),
  folderId: z.string(),
}).strict();
export type FileMoveInput = z.infer<typeof FileMoveInput>;

// Set file order: position becomes the index of each id in the array.
export const FileReorderInput = z.object({
  fileIds: z.array(z.string().min(1)).min(1),
}).strict();
export type FileReorderInput = z.infer<typeof FileReorderInput>;

// ---- Multipart direct-to-storage upload ----
export const UploadInitInput = z.object({
  filename: z.string().min(1).max(500),
  mimeType: z.string().max(200).optional(),
  size: z.number().int().nonnegative(),
  folderId: z.string().optional(),
}).strict();
export type UploadInitInput = z.infer<typeof UploadInitInput>;

export const PartUrlsInput = z.object({
  fileId: z.string().min(1),
  partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(1000),
}).strict();
export type PartUrlsInput = z.infer<typeof PartUrlsInput>;

export const UploadCompleteInput = z.object({
  fileId: z.string().min(1),
  parts: z.array(z.object({
    partNumber: z.number().int().min(1).max(10000),
    etag: z.string().min(1),
  })).min(1),
}).strict();
export type UploadCompleteInput = z.infer<typeof UploadCompleteInput>;

export const UploadAbortInput = z.object({
  fileId: z.string().min(1),
}).strict();
export type UploadAbortInput = z.infer<typeof UploadAbortInput>;

// Edit a file's metadata.
export const FilePatchInput = z.object({
  displayName: z.string().min(1).max(200).nullable(),
  description: z.string().max(2000).nullable(),
  folderId: z.string(),
}).partial().strict();
export type FilePatchInput = z.infer<typeof FilePatchInput>;
