import { z } from 'zod';

export const WatermarkPosition = z.enum([
  'top-left', 'top-right', 'top-center',
  'bottom-left', 'bottom-right', 'bottom-center',
  'center',
]);
export type WatermarkPosition = z.infer<typeof WatermarkPosition>;

export const WatermarkSize = z.enum(['small', 'medium', 'large']);
export type WatermarkSize = z.infer<typeof WatermarkSize>;

const Opacity = z.number().min(0).max(1);
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/);

export const TextWatermarkConfig = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(120),
  position: WatermarkPosition,
  size: WatermarkSize,
  opacity: Opacity,
  color: HexColor,
}).strict();
export type TextWatermarkConfig = z.infer<typeof TextWatermarkConfig>;

export const ImageWatermarkConfig = z.object({
  type: z.literal('image'),
  s3Key: z.string().min(1),
  position: WatermarkPosition,
  size: WatermarkSize,
  opacity: Opacity,
}).strict();
export type ImageWatermarkConfig = z.infer<typeof ImageWatermarkConfig>;

export const WatermarkConfig = z.discriminatedUnion('type', [TextWatermarkConfig, ImageWatermarkConfig]);
export type WatermarkConfig = z.infer<typeof WatermarkConfig>;

export const WatermarkPresetCreateInput = z.object({
  name: z.string().min(1).max(120),
  config: WatermarkConfig,
}).strict();
export type WatermarkPresetCreateInput = z.infer<typeof WatermarkPresetCreateInput>;

export const WatermarkPresetPatchInput = z.object({
  name: z.string().min(1).max(120),
  config: WatermarkConfig,
}).partial().strict();
export type WatermarkPresetPatchInput = z.infer<typeof WatermarkPresetPatchInput>;
