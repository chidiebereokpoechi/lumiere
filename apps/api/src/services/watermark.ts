// Watermark compositing for the image-processing pipeline (v1.2 §9). Builds an
// SVG overlay matching the base image's dimensions and composites with Sharp.
// SVG is portable (no Pango font availability concerns) and gives exact control
// over position, size, opacity, and colour.

import sharp from 'sharp';
import type { WatermarkConfig, TextWatermarkConfig } from '@lumiere/types';
import { getObjectStream } from './storage';

const SIZE_FACTOR: Record<TextWatermarkConfig['size'], number> = {
  small: 0.035,
  medium: 0.055,
  large: 0.085,
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildTextSvg(width: number, height: number, cfg: TextWatermarkConfig): Buffer {
  const fontSize = Math.max(12, Math.round(width * SIZE_FACTOR[cfg.size]));
  const padding = Math.round(fontSize * 0.8);

  let x: number; let y: number; let anchor: 'start' | 'middle' | 'end';
  switch (cfg.position) {
    case 'top-left':      x = padding;         y = padding + fontSize;        anchor = 'start';  break;
    case 'top-right':     x = width - padding; y = padding + fontSize;        anchor = 'end';    break;
    case 'top-center':    x = width / 2;       y = padding + fontSize;        anchor = 'middle'; break;
    case 'bottom-left':   x = padding;         y = height - padding;          anchor = 'start';  break;
    case 'bottom-right':  x = width - padding; y = height - padding;          anchor = 'end';    break;
    case 'bottom-center': x = width / 2;       y = height - padding;          anchor = 'middle'; break;
    case 'center':        x = width / 2;       y = height / 2 + fontSize / 3; anchor = 'middle'; break;
  }

  // Use a font that's actually installed in the container (see Dockerfile).
  // librsvg falls back to tofu boxes if the named family can't be resolved.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<text x="${x}" y="${y}" font-family="DejaVu Sans, sans-serif" ` +
    `font-size="${fontSize}" font-weight="700" fill="${cfg.color}" fill-opacity="${cfg.opacity}" ` +
    `text-anchor="${anchor}" stroke="#000000" stroke-opacity="${cfg.opacity * 0.4}" stroke-width="${fontSize / 40}" paint-order="stroke">` +
    `${escapeXml(cfg.text)}</text></svg>`;
  return Buffer.from(svg);
}

const IMAGE_GRAVITY: Record<TextWatermarkConfig['position'], string> = {
  'top-left':      'northwest',
  'top-right':     'northeast',
  'top-center':    'north',
  'bottom-left':   'southwest',
  'bottom-right':  'southeast',
  'bottom-center': 'south',
  'center':        'center',
};

const IMAGE_SIZE_FACTOR: Record<TextWatermarkConfig['size'], number> = {
  small: 0.10,
  medium: 0.18,
  large: 0.30,
};

/**
 * Composite a watermark onto an image. Returns the watermarked image as a WebP
 * buffer. The base image is consumed unchanged; the caller can use this for the
 * `watermarked/{gid}/{pid}.webp` derivative.
 */
export async function applyWatermark(base: Buffer, config: WatermarkConfig): Promise<Buffer> {
  const meta = await sharp(base).metadata();
  const width = meta.width ?? 1200;
  const height = meta.height ?? 800;

  if (config.type === 'text') {
    const svg = buildTextSvg(width, height, config);
    return sharp(base)
      .composite([{ input: svg, top: 0, left: 0 }])
      .webp({ quality: 88 })
      .toBuffer();
  }

  // Image watermark: pull the logo from S3, resize relative to base width,
  // adjust opacity, then composite at the requested gravity.
  const logoStream = await getObjectStream(config.s3Key);
  const chunks: Uint8Array[] = [];
  for await (const chunk of logoStream) chunks.push(chunk as Uint8Array);
  const logoBuf = Buffer.concat(chunks);

  const targetWidth = Math.round(width * IMAGE_SIZE_FACTOR[config.size]);
  const resizedLogo = await sharp(logoBuf)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .ensureAlpha(config.opacity)
    .png()
    .toBuffer();

  return sharp(base)
    .composite([{ input: resizedLogo, gravity: IMAGE_GRAVITY[config.position] }])
    .webp({ quality: 88 })
    .toBuffer();
}
