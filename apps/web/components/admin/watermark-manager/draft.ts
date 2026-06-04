import type {
  WatermarkPreset,
  WatermarkPosition,
  WatermarkSize,
} from "@/lib/api/watermarks";

export const POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "center", label: "Center" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

export const SIZES: { value: WatermarkSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

// Editable shape for a watermark preset - flattens the discriminated config so
// the form can bind every field; re-narrowed to a WatermarkConfig on save.
export interface Draft {
  id?: string;
  name: string;
  type: "text" | "image";
  text: string;
  color: string;
  position: WatermarkPosition;
  size: WatermarkSize;
  opacity: number;
  s3Key?: string;
  logoPreview?: string; // object URL of a freshly-uploaded logo
}

export const blankDraft: Draft = {
  name: "",
  type: "text",
  text: "",
  color: "#ffffff",
  position: "bottom-right",
  size: "medium",
  opacity: 0.4,
};

export function draftFrom(p: WatermarkPreset): Draft {
  const c = p.config;
  return {
    id: p.id,
    name: p.name,
    type: c.type,
    text: c.type === "text" ? c.text : "",
    color: c.type === "text" ? c.color : "#ffffff",
    position: c.position,
    size: c.size,
    opacity: c.opacity,
    s3Key: c.type === "image" ? c.s3Key : undefined,
  };
}
