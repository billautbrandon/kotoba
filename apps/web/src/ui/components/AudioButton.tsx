import React, { useState, useEffect, useRef } from "react";

interface AudioButtonProps {
  text: string;
  lang?: string;
  className?: string;
  size?: "small" | "medium" | "large";
}

export function AudioButton({ text, lang = "ja-JP", className = "", size = "medium" }: AudioButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      if (utteranceRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const handleClick = () => {
    if (!isSupported) {
      return;
    }

    if (!text || text.trim() === "" || text === "—") {
      return;
    }

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      setIsPlaying(true);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      utteranceRef.current = null;
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      utteranceRef.current = null;
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const sizeStyles = {
    small: { width: "16px", height: "16px", fontSize: "12px" },
    medium: { width: "20px", height: "20px", fontSize: "14px" },
    large: { width: "24px", height: "24px", fontSize: "16px" },
  };

  const iconSize = sizeStyles[size];

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
      cursor:
        isSupported && text && text.trim() !== "" && text !== "—" ? "pointer" : "not-allowed",
      opacity:
        isSupported && text && text.trim() !== "" && text !== "—" ? (isPlaying ? 1 : 0.6) : 0.3,
        padding: "2px",
        marginLeft: "4px",
        transition: "opacity 0.2s ease",
        color: "var(--color-text-soft)",
        ...iconSize,
      }}
      aria-label="Prononcer"
      disabled={!isSupported || !text || text.trim() === "" || text === "—"}
    >
      {isPlaying ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ width: "100%", height: "100%" }}
        >
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: "100%", height: "100%" }}
        >
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      )}
    </button>
  );
}

