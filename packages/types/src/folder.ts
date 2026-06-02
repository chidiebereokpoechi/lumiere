import { z } from 'zod';

export const FolderCreateInput = z.object({
  name: z.string().min(1).max(120),
}).strict();
export type FolderCreateInput = z.infer<typeof FolderCreateInput>;

export const FolderPatchInput = z.object({
  name: z.string().min(1).max(120),
  position: z.number().int().min(0),
  coverFileId: z.string().nullable(),
}).partial().strict();
export type FolderPatchInput = z.infer<typeof FolderPatchInput>;

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

// Edit a file's metadata.
export const FilePatchInput = z.object({
  displayName: z.string().min(1).max(200).nullable(),
  description: z.string().max(2000).nullable(),
  folderId: z.string(),
}).partial().strict();
export type FilePatchInput = z.infer<typeof FilePatchInput>;
