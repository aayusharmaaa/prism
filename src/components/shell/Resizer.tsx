"use client";

import { useCallback, useRef } from "react";

/**
 * Drag handle between panes. Sits in a 1px gutter but exposes a 7px hit area,
 * which is the difference between "feels like an IDE" and "feels like a demo".
 */
export function Resizer({
  onResize,
  ariaLabel,
}: {
  onResize: (deltaX: number) => void;
  ariaLabel: string;
}) {
  const lastX = useRef(0);
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragging.current = true;
      lastX.current = e.clientX;
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;
      if (dx === 0) return;
      lastX.current = e.clientX;
      onResize(dx);
    },
    [onResize],
  );

  const stop = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onResize(-16);
        if (e.key === "ArrowRight") onResize(16);
      }}
      className="group relative z-10 w-px shrink-0 cursor-col-resize bg-line"
    >
      <div className="absolute inset-y-0 -left-[3px] -right-[3px] transition-colors group-hover:bg-accent/60 group-focus-visible:bg-accent" />
    </div>
  );
}
