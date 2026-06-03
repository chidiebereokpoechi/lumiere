import { apiServer } from '@/lib/api-client';

export type WatermarkPosition =
  | 'top-left' | 'top-right' | 'top-center'
  | 'bottom-left' | 'bottom-right' | 'bottom-center'
  | 'center';
export type WatermarkSize = 'small' | 'medium' | 'large';

export interface TextWatermarkConfig {
  type: 'text';
  text: string;
  position: WatermarkPosition;
  size: WatermarkSize;
  opacity: number;
  color: string;
}
export interface ImageWatermarkConfig {
  type: 'image';
  s3Key: string;
  position: WatermarkPosition;
  size: WatermarkSize;
  opacity: number;
}
export type WatermarkConfig = TextWatermarkConfig | ImageWatermarkConfig;

export interface WatermarkPreset {
  id: string;
  name: string;
  type: 'text' | 'image';
  config: WatermarkConfig;
}

export function fetchWatermarkPresets() {
  return apiServer<WatermarkPreset[]>('/api/watermark-presets');
}

export interface LogoUploadResult {
  s3Key: string;
  fileSize: number;
  mimeType: string;
}
