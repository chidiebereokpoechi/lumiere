// Unified media model: every item in a folder is a `files` row with a `type`
// enum (image|video|audio|file). The hand-written SQL migration is the source
// of truth — this file is for typed queries.
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export const photographers = sqliteTable('photographers', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  brandName: text('brand_name'),
  logoS3Key: text('logo_s3_key'),
  // Public creator links surfaced on the client gallery landing.
  website: text('website'),
  instagram: text('instagram'),
  settings: text('settings').default('{}'),
  createdAt: integer('created_at').notNull(),
});

export const galleries = sqliteTable('galleries', {
  id: text('id').primaryKey(),
  photographerId: text('photographer_id').notNull().references(() => photographers.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  coverFileId: text('cover_file_id').references((): AnySQLiteColumn => files.id, { onDelete: 'set null' }),
  // Standalone cover (uploaded, not a gallery photo). Takes precedence over
  // coverFileId when set. Focal point (0-100%) drives object-position cropping.
  coverImageKey: text('cover_image_key'),
  coverFocalX: integer('cover_focal_x'),
  coverFocalY: integer('cover_focal_y'),
  passwordHash: text('password_hash'),
  status: text('status').default('active'),
  downloadMode: text('download_mode').default('watermarked'),
  expiresAt: integer('expires_at'),
  gracePeriodDays: integer('grace_period_days').default(0),
  allowFavorites: integer('allow_favorites').default(1),
  allowComments: integer('allow_comments').default(0),
  allowDownload: integer('allow_download').default(1),
  clientName: text('client_name'),
  clientEmail: text('client_email'),
  eventDate: integer('event_date'),
  eventType: text('event_type'),
  layout: text('layout').default('grid'),
  // Client landing: 'tabs' (one row of collection tabs) or 'collections' (an
  // iOS-Photos-style albums grid you drill into).
  navStyle: text('nav_style').default('collections'),
  colorTheme: text('color_theme').default('light'),
  customCss: text('custom_css'),
  watermarkPresetId: text('watermark_preset_id'),
  sortOrder: text('sort_order').default('manual'),
  notifyOnView: integer('notify_on_view').default(1),
  viewCount: integer('view_count').default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const galleryFolders = sqliteTable('gallery_folders', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id').notNull().references(() => galleries.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').default(0),
  hidden: integer('hidden').default(0),
  coverFileId: text('cover_file_id').references((): AnySQLiteColumn => files.id, { onDelete: 'set null' }),
});

// Unified media. `type` is the canonical kind; image-pipeline columns
// (thumbnail/preview/watermarked, dimensions, palette) are only populated for
// type='image'. Non-images are uploadStatus='ready' immediately.
export type FileType = 'image' | 'video' | 'audio' | 'file';
export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id').notNull().references(() => galleries.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').references(() => galleryFolders.id, { onDelete: 'set null' }),
  type: text('type').notNull().default('file').$type<FileType>(),
  filenameOriginal: text('filename_original').notNull(),
  displayName: text('display_name'),
  description: text('description'),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  s3KeyOriginal: text('s3_key_original'),
  s3KeyPreview: text('s3_key_preview'),
  s3KeyThumbnail: text('s3_key_thumbnail'),
  s3KeyWatermarked: text('s3_key_watermarked'),
  width: integer('width'),
  height: integer('height'),
  exifData: text('exif_data'),
  colorPalette: text('color_palette'),
  position: integer('position').default(0),
  uploadStatus: text('upload_status').default('ready'),
  errorMessage: text('error_message'),
  // Set while a multipart direct-to-storage upload is in flight; cleared on
  // complete. Lets the reaper abort orphaned S3 multipart uploads.
  s3UploadId: text('s3_upload_id'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  byGallery: index('idx_files_gallery').on(t.galleryId),
  byFolder: index('idx_files_folder').on(t.folderId),
}));

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  galleryId: text('gallery_id').references(() => galleries.id, { onDelete: 'cascade' }),
  payload: text('payload').notNull(),
  status: text('status').default('queued'),
  attempts: integer('attempts').default(0),
  maxAttempts: integer('max_attempts').default(3),
  lockedAt: integer('locked_at'),
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const gallerySessions = sqliteTable('gallery_sessions', {
  token: text('token').primaryKey(),
  galleryId: text('gallery_id').notNull().references(() => galleries.id, { onDelete: 'cascade' }),
  clientIp: text('client_ip'),
  clientEmail: text('client_email'),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

// Client-made lists (selects/collections), keyed to a session + their email.
// Visible to the client (this session) and the creator.
export const lists = sqliteTable('lists', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id').notNull().references(() => galleries.id, { onDelete: 'cascade' }),
  sessionToken: text('session_token'),
  clientEmail: text('client_email'),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  byGallery: index('idx_lists_gallery').on(t.galleryId),
}));

export const listItems = sqliteTable('list_items', {
  id: text('id').primaryKey(),
  listId: text('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  fileId: text('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  unq: uniqueIndex('uniq_list_item').on(t.listId, t.fileId),
}));

export const favorites = sqliteTable('favorites', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id').notNull().references(() => galleries.id, { onDelete: 'cascade' }),
  fileId: text('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
  sessionToken: text('session_token'),
  clientEmail: text('client_email'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  unq: uniqueIndex('uniq_fav').on(t.galleryId, t.fileId, t.sessionToken),
}));

export const downloads = sqliteTable('downloads', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id').notNull().references(() => galleries.id, { onDelete: 'cascade' }),
  fileId: text('file_id').references(() => files.id, { onDelete: 'set null' }),
  clientIp: text('client_ip'),
  clientEmail: text('client_email'),
  createdAt: integer('created_at').notNull(),
});

export const galleryViews = sqliteTable('gallery_views', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id').notNull().references(() => galleries.id, { onDelete: 'cascade' }),
  clientIp: text('client_ip'),
  userAgent: text('user_agent'),
  referrer: text('referrer'),
  createdAt: integer('created_at').notNull(),
});

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id').references(() => galleries.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  recipient: text('recipient').notNull(),
  sentAt: integer('sent_at'),
  status: text('status').default('pending'),
});

export const watermarkPresets = sqliteTable('watermark_presets', {
  id: text('id').primaryKey(),
  photographerId: text('photographer_id').notNull().references(() => photographers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  config: text('config').notNull(),
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id').notNull().references(() => galleries.id, { onDelete: 'cascade' }),
  fileId: text('file_id').references(() => files.id, { onDelete: 'cascade' }),
  clientName: text('client_name'),
  clientEmail: text('client_email'),
  body: text('body').notNull(),
  isApproved: integer('is_approved').default(0),
  // Scope drives visibility: 'set' = public comment on the file (needs approval,
  // shown to all). 'list'/'favorites' = a private editable note scoped to that
  // collection, visible only to its author (by email) + the admin.
  scope: text('scope').notNull().default('set'),
  listId: text('list_id'),
  createdAt: integer('created_at').notNull(),
});

// Extension to v1.2 §5: rotating refresh tokens, stored hashed.
export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  photographerId: text('photographer_id').notNull().references(() => photographers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  byPhotographer: index('idx_refresh_tokens_photographer').on(t.photographerId),
}));
