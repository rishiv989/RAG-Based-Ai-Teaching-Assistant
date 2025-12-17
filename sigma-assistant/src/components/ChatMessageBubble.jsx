// src/components/ChatMessageBubble.jsx
import React from "react";

/**
 * message shape:
 * {
 *   id: string,
 *   role: "user" | "assistant",
 *   content: string,
 *   timestamps?: [
 *     { label: string, videoId: string, seconds: number }
 *   ]
 * }
 */

export default function ChatMessageBubble({ message, onTimestampClick }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-900 rounded-bl-sm"
        }`}
      >
        <div>{message.content}</div>

        {/* Timestamp buttons (for YouTube) */}
        {message.timestamps && message.timestamps.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.timestamps.map((ts, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onTimestampClick && onTimestampClick(ts)}
                className="text-xs px-2 py-1 rounded-full border border-blue-500 text-blue-600 bg-white hover:bg-blue-50 transition"
              >
                {ts.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
