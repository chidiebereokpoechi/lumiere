"use client";

import { useState } from "react";
import type { GalleryFile } from "@/lib/api/files";
import { CoverControl, type CoverState } from "./file-manager/cover-control";

// Settings-page cover widget: holds the cover state locally (CoverControl
// persists each change to the gallery itself) and shows the editor.
export function GalleryCoverField({
  galleryId,
  images,
  initialCover,
}: {
  galleryId: string;
  images: GalleryFile[];
  initialCover: CoverState;
}) {
  const [cover, setCover] = useState<CoverState>(initialCover);
  return (
    <CoverControl
      galleryId={galleryId}
      images={images}
      cover={cover}
      onChange={setCover}
    />
  );
}
