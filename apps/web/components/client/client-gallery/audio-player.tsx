"use client";

import { useRef, useState } from "react";
import { Music, Play, Pause, SkipBack, SkipForward } from "@/components/ui/icons";

// Music-player-style audio surface: artwork, title, scrubber, transport.
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
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

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
  const seek = (v: number) => {
    const a = ref.current;
    if (a) {
      a.currentTime = v;
      setCur(v);
    }
  };
  const nudge = (d: number) => {
    const a = ref.current;
    if (a)
      seek(Math.min(dur || a.duration || 0, Math.max(0, a.currentTime + d)));
  };

  return (
    <div className="w-[min(92vw,24rem)] rounded-2xl border border-border bg-surface p-4 shadow-[0_8px_30px_rgba(0,0,0,0.10)]">
      <div className="aspect-square w-full rounded-xl overflow-hidden bg-linear-to-br from-accent/40 via-surface-sunken to-surface-strong flex items-center justify-center">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music size={64} className="text-ink-inverse/80" />
        )}
      </div>

      <div className="mt-4 text-center">
        <p className="text-base font-bold text-ink-strong truncate">{title}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-ink-subtle tabular-nums">
            {subtitle}
          </p>
        )}
      </div>

      <input
        type="range"
        min={0}
        max={dur || 0}
        step={0.1}
        value={Math.min(cur, dur || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Seek"
        className="mt-4 w-full accent-accent"
      />
      <div className="flex justify-between text-[11px] text-ink-subtle tabular-nums">
        <span>{fmt(cur)}</span>
        <span>-{fmt(Math.max(0, (dur || 0) - cur))}</span>
      </div>

      <div className="mt-3 flex items-center justify-center gap-7">
        <button
          type="button"
          onClick={() => nudge(-24)}
          aria-label="Back 24 seconds"
          className="text-ink-muted hover:text-ink-strong"
        >
          <SkipBack size={24} />
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="h-16 w-16 inline-flex items-center justify-center rounded-full bg-ink-strong text-ink-inverse hover:opacity-90 transition-opacity"
        >
          {playing ? (
            <Pause size={24} />
          ) : (
            <Play size={24} className="ml-0.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => nudge(24)}
          aria-label="Forward 24 seconds"
          className="text-ink-muted hover:text-ink-strong"
        >
          <SkipForward size={24} />
        </button>
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
