import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface ImageLightboxProps {
  src: string;
  alt: string;
  description?: string | null;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  src,
  alt,
  description,
  onClose,
}) => {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [dragY, setDragY] = useState(0);
  const isDragging = useRef(false);
  const pinchRef = useRef<{ initialDist: number; initialScale: number } | null>(
    null,
  );
  const swipeRef = useRef<{ startY: number } | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const dist = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = {
        initialDist: dist(e.touches[0], e.touches[1]),
        initialScale: scale,
      };
      swipeRef.current = null;
    } else if (e.touches.length === 1 && scale <= 1) {
      swipeRef.current = { startY: e.touches[0].clientY };
      pinchRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const newScale = Math.max(
        1,
        Math.min(
          4,
          pinchRef.current.initialScale *
            (dist(e.touches[0], e.touches[1]) / pinchRef.current.initialDist),
        ),
      );
      setScale(newScale);
    } else if (e.touches.length === 1 && swipeRef.current && scale <= 1) {
      const dy = e.touches[0].clientY - swipeRef.current.startY;
      if (dy > 0) {
        isDragging.current = true;
        setDragY(dy);
      }
    }
  };

  const handleTouchEnd = () => {
    if (isDragging.current && dragY > 80) {
      onClose();
      return;
    }
    isDragging.current = false;
    setDragY(0);
    pinchRef.current = null;
    swipeRef.current = null;
  };

  const backdropOpacity = scale > 1 ? 0.92 : Math.max(0.3, 0.92 - dragY / 280);
  const isGesturing = isDragging.current || pinchRef.current !== null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        backgroundColor: `rgba(0,0,0,${backdropOpacity})`,
        backdropFilter: `blur(${backdropOpacity * 20}px)`,
        animation: "lightboxFadeIn 0.25s ease-out",
        transition: isGesturing
          ? "none"
          : "background-color 0.2s, backdrop-filter 0.2s",
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10"
        aria-label={t("common.close", "Close")}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M4 4L14 14M14 4L4 14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Image container */}
      <div
        className="relative z-10 max-w-[90vw] max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateY(${dragY}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: isGesturing
            ? "none"
            : "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
          animation:
            !isGesturing && dragY === 0 && scale === 1
              ? "lightboxZoomIn 0.3s cubic-bezier(0.16,1,0.3,1)"
              : undefined,
          touchAction: "none",
          cursor: scale > 1 ? "grab" : "default",
        }}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-contain"
          style={{ maxHeight: "85vh" }}
          draggable={false}
        />
      </div>

      {/* Hints */}
      <div className="absolute bottom-8 left-0 right-0 text-center z-10 space-y-1 pointer-events-none">
        {scale <= 1 && dragY === 0 && (
          <p className="text-white/30 text-[9px] font-bold uppercase tracking-[0.2em] md:hidden">
            {t(
              "auto.swipeDownToClosePinchToZoom",
              "Swipe down to close · Pinch to zoom",
            )}
          </p>
        )}
        <p className="text-white/50 text-[11px] font-bold uppercase tracking-[0.2em]">
          {alt}
        </p>
        {description && (
          <p className="text-white/70 text-xs font-medium leading-relaxed max-w-md mx-auto px-6 normal-case tracking-normal">
            {description}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
};
