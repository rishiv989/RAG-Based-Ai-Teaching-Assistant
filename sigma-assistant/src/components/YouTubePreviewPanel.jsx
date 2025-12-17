// src/components/YouTubePreviewPanel.jsx
import React from "react";

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * activeTimestamp shape:
 * {
 *   label: string,
 *   videoId: string,
 *   seconds: number
 * }
 */
export default function YouTubePreviewPanel({ activeTimestamp, onClose }) {
  if (!activeTimestamp) return null;

  const { videoId, seconds, label } = activeTimestamp;
  const src = `https://www.youtube.com/embed/${videoId}?start=${seconds}&autoplay=1&rel=0`;

  return (
    <div className="flex flex-col h-full w-full border-l border-gray-200 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-800">
            Video Preview
          </span>
          <span className="text-xs text-gray-500 truncate max-w-xs">
            {label} • {formatTime(seconds)}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded-full border border-gray-300 hover:bg-gray-100 transition"
          >
            Close
          </button>
        )}
      </div>

      {/* Player */}
      <div className="flex-1 p-3">
        <div className="w-full h-full aspect-video">
          <iframe
            key={`${videoId}-${seconds}`} // force reload on timestamp change
            className="w-full h-full rounded-xl shadow-sm"
            src={src}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        <div className="mt-2 flex justify-end">
          <a
            href={`https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline text-blue-600 hover:text-blue-800"
          >
            Open on YouTube
          </a>
        </div>
      </div>
    </div>
  );
}
