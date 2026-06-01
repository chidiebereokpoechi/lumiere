// Mirrors v1.2 §5 verbatim, plus a refresh_tokens table for rotating refresh sessions.
// The hand-written SQL migration is the source of truth — this file is for typed queries.
import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export const photographers = sqliteTable('photographers', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  brandName: text('brand_name'),
  logoS3Key: text('logo_s3_key'),
  settings: text('settings').default('{}'),
  createdAt: integer('created_at').notNull(),
});

export const galleries = sqliteTable('galleries', {
  id: text('id').primaryKey(),
  photographerId: text('photographer_id').notNull().references(() => photographers.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  coverPhotoId: text('cover_photo_id').references((): AnySQLiteColumn => photos.id, { onDelete: 'set null' }),
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
  coverPhotoId: text('cover_photo_id').references((): AnySQLiteColumn => photos.id, { onDelete: 'set null' }),
});

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id').notNull().references(() => galleries.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').references(() => galleryFolders.id, { onDelete: 'set null' }),
  filenameOriginal: text('filename_original').notNull(),
  s3KeyOriginal: text('s3_key_original'),
  s3KeyPreview: text('s3_key_preview'),
  s3KeyThumbnail: text('s3_key_thumbnail'),
  s3KeyWatermarked: text('s3_key_watermarked'),
  width: integer('width'),
  height: integer('height'),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  exifData: text('exif_data'),
  colorPalette: text('color_palette'),
  position: integer('position').default(0),
  uploadStatus: text('upload_status').default('processing'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at').notNull(),
});

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
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const favorites = sqliteTable('favorites', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id').notNull().references(() => galleries.id, { onDelete: 'cascade' }),
  photoId: text('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  sessionToken: text('session_token'),
  clientEmail: text('client_email'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  unq: uniqueIndex('uniq_fav').on(t.galleryId, t.photoId, t.sessionToken),
}));

export const downloads = sqliteTable('downloads', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id').notNull().references(() => galleries.id, { onDelete: 'cascade' }),
  photoId: text('photo_id').references(() => photos.id, { onDelete: 'set null' }),
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
  photoId: text('photo_id').references(() => photos.id, { onDelete: 'cascade' }),
  clientName: text('client_name'),
  clientEmail: text('client_email'),
  body: text('body').notNull(),
  isApproved: integer('is_approved').default(0),
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
