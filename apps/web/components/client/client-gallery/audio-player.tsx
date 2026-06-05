"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

// Accent-based fallback palette (peach/blue tokens) when no thumbnail or its
// pixels can't be read (cross-origin S3 without CORS taints the canvas).
const ACCENT_PALETTE = ["#124ebe", "#3770d8", "#97b9f8"];
const PEAK_COUNT = 128;

// Full-bleed music player for the lightbox: the thumbnail covers the whole
// background, a real (decoded) waveform — quantized + coloured from the
// thumbnail's palette — paints over it and fills to the playhead, and the
// transport sits centered on top. The waveform doubles as the scrubber.
export function AudioPlayer({
  src,
  title,
  subtitle,
  cover,
  onPlayingChange,
}: {
  src: string;
  title: string;
  subtitle: string;
  cover?: string | null;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [palette, setPalette] = useState<string[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // ---- decode the track into quantized peaks (once per src) ----
  useEffect(() => {
    let alive = true;
    setPeaks([]);
    const AC: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    // Fetch the same-origin proxy (?proxy=1) so the bytes are readable — the
    // plain stream URL 302s to cross-origin S3, which fetch can't read.
    const decodeUrl = `${src}${src.includes("?") ? "&" : "?"}proxy=1`;
    fetch(decodeUrl, { credentials: "include" })
      .then((r) => r.arrayBuffer())
      .then((buf) => ac.decodeAudioData(buf))
      .then((audio) => {
        if (!alive) return;
        const ch = audio.getChannelData(0);
        const block = Math.max(1, Math.floor(ch.length / PEAK_COUNT));
        const out: number[] = [];
        for (let i = 0; i < PEAK_COUNT; i++) {
          // RMS per block — more dynamic range than peak-max (which saturates
          // to ~1 across loud music and reads as uniform bars).
          let sum = 0;
          for (let j = 0; j < block; j++) {
            const v = ch[i * block + j] ?? 0;
            sum += v * v;
          }
          out.push(Math.sqrt(sum / block));
        }
        const norm = Math.max(...out, 0.0001);
        // Gentle gamma lifts quiet sections so the contour is visible.
        setPeaks(out.map((v) => Math.pow(v / norm, 0.7)));
      })
      .catch(() => {
        if (alive) setPeaks([]);
      })
      .finally(() => {
        void ac.close?.();
      });
    return () => {
      alive = false;
    };
  }, [src]);

  // ---- pull a vivid palette out of the thumbnail ----
  useEffect(() => {
    if (!cover) {
      setPalette([]);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      const S = 14;
      c.width = S;
      c.height = S;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, S, S);
      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, S, S).data;
      } catch {
        return; // tainted (cross-origin) — keep accent fallback
      }
      const cols: { c: string; score: number }[] = [];
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]!,
          g = data[i + 1]!,
          b = data[i + 2]!,
          a = data[i + 3]!;
        if (a < 128) continue;
        const mx = Math.max(r, g, b),
          mn = Math.min(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        cols.push({ c: `rgb(${r},${g},${b})`, score: sat * 0.75 + (mx / 255) * 0.25 });
      }
      cols.sort((x, y) => y.score - x.score);
      const top = cols.slice(0, 6).map((x) => x.c);
      if (top.length) setPalette(top);
    };
    img.src = cover;
  }, [cover]);

  // ---- canvas sizing ----
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: cv.clientWidth, h: cv.clientHeight }),
    );
    ro.observe(cv);
    setSize({ w: cv.clientWidth, h: cv.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---- draw: quantized bars, coloured across the palette, filled to playhead ----
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const { w, h } = size;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Fallback contour (decode still loading / unavailable) — varied, not flat.
    const bars = peaks.length
      ? peaks
      : Array.from(
          { length: PEAK_COUNT },
          (_, i) => 0.2 + 0.55 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.13)),
        );
    const colors = palette.length ? palette : ACCENT_PALETTE;
    const n = bars.length;
    const slot = w / n;
    const barW = Math.max(2, slot * 0.55);
    const progress = dur > 0 ? cur / dur : 0;
    const mid = h / 2;

    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * slot;
      const bh = Math.max(3, bars[i]! * h * 0.7);
      const played = i / n <= progress;
      ctx.fillStyle = colors[Math.floor((i / n) * colors.length) % colors.length]!;
      ctx.globalAlpha = played ? 0.95 : 0.28;
      ctx.fillRect(x - barW / 2, mid - bh / 2, barW, bh);
    }
    ctx.globalAlpha = 1;
  }, [peaks, palette, cur, dur, size]);

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60)
      .toString()
      .padStart(2, "0")}`;
  };
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };
  const seek = useCallback((v: number) => {
    const a = ref.current;
    if (a) {
      a.currentTime = v;
      setCur(v);
    }
  }, []);
  const nudge = (d: number) => {
    const a = ref.current;
    if (a) seek(Math.min(dur || a.duration || 0, Math.max(0, a.currentTime + d)));
  };
  const scrub = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv || !dur) return;
    const rect = cv.getBoundingClientRect();
    seek(Math.min(dur, Math.max(0, ((e.clientX - rect.left) / rect.width) * dur)));
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Thumbnail fills the whole background. */}
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      )}
      {/* Scrim — darken + soften so the controls stay legible. */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

      {/* Centered transport over it all. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 text-center pointer-events-none">
        {/* Album art above the controls (the cover also fills the background). */}
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            draggable={false}
            className="h-40 w-40 sm:h-52 sm:w-52 rounded-md object-cover border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
          />
        )}
        <div className="pointer-events-none">
          <p className="text-lg font-bold tracking-wider text-white drop-shadow truncate max-w-[80vw]">
            {title}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs tracking-wider text-white/80 tabular-nums drop-shadow">
              {subtitle}
            </p>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-4">
          <Button
            variant="secondary"
            onClick={() => nudge(-15)}
            aria-label="Back 15 seconds"
            className="h-12 w-12 px-0"
          >
            <SkipBack size={20} />
          </Button>
          <Button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="h-16 w-16 px-0"
          >
            {playing ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
          </Button>
          <Button
            variant="secondary"
            onClick={() => nudge(15)}
            aria-label="Forward 15 seconds"
            className="h-12 w-12 px-0"
          >
            <SkipForward size={20} />
          </Button>
        </div>

        {/* Compact waveform scrubber — decoded peaks, coloured from the cover,
            filled to the playhead. Click to seek. */}
        <canvas
          ref={canvasRef}
          onClick={scrub}
          className="pointer-events-auto h-14 w-[min(80vw,28rem)] cursor-pointer"
        />

        <div className="pointer-events-none flex w-[min(80vw,28rem)] justify-between text-xs tracking-wider text-white/80 tabular-nums drop-shadow">
          <span>{fmt(cur)}</span>
          <span>-{fmt(Math.max(0, (dur || 0) - cur))}</span>
        </div>
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={ref}
        src={src}
        onPlay={() => {
          setPlaying(true);
          onPlayingChange?.(true);
        }}
        onPause={() => {
          setPlaying(false);
          onPlayingChange?.(false);
        }}
        onTimeUpdate={() => setCur(ref.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDur(ref.current?.duration ?? 0)}
        onEnded={() => {
          setPlaying(false);
          onPlayingChange?.(false);
        }}
        className="hidden"
      />
    </div>
  );
}
