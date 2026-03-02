"use client";

import { useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";

interface VideoPlayerProps {
  category: string | null;
}

export function VideoPlayer({ category }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  function togglePlay() {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }

  function toggleMute() {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }

  function handleFullscreen() {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-card">
      {/* Category label */}
      {category && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          <span className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground uppercase tracking-wider">
            {category}
          </span>
        </div>
      )}

      {/* Video element */}
      <div className="relative aspect-video bg-background/60">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          poster=""
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        >
          {/* Placeholder: Big Buck Bunny open-source sample */}
          <source
            src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
            type="video/mp4"
          />
          Your browser does not support the video tag.
        </video>

        {/* Play overlay when paused */}
        {!isPlaying && (
          <button
            onClick={togglePlay}
            aria-label="Play video"
            className="absolute inset-0 flex items-center justify-center bg-background/40 transition-colors hover:bg-background/30"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30">
              <Play className="h-7 w-7 ml-1" />
            </div>
          </button>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-secondary transition-colors"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </button>
          <button
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute" : "Mute"}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-secondary transition-colors"
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {category && (
            <span className="text-xs text-muted-foreground font-mono">
              Now playing: {category}
            </span>
          )}
          <button
            onClick={handleFullscreen}
            aria-label="Fullscreen"
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-secondary transition-colors"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
