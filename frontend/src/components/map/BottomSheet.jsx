import { useLayoutEffect, useRef } from "react";

export const PEEK_HEIGHT = 104;
const ORDER = ["peek", "half", "full"];

/** Visible height (px) of the sheet in a given snap state. Shared with the map so it can pad its view. */
export function sheetVisible(snap, H) {
  const full = Math.min(H, Math.max(Math.round(H * 0.88), PEEK_HEIGHT + 240));
  const half = Math.min(full - 80, Math.max(Math.round(H * 0.48), PEEK_HEIGHT + 160));
  return { peek: PEEK_HEIGHT, half, full }[snap];
}

/**
 * Three-snap bottom sheet (peek / half / full). The header is the only drag surface, so the body scrolls
 * natively. Dragging writes the transform directly (no React re-render per frame) and snaps with velocity.
 */
export default function BottomSheet({ snap, onSnapChange, containerH, header, label, children }) {
  const ref = useRef(null);
  const body = useRef(null);
  const drag = useRef(null);
  const full = sheetVisible("full", containerH);
  const yOf = (s) => full - sheetVisible(s, containerH);
  const place = (y) => { if (ref.current) ref.current.style.transform = `translate3d(0, ${y}px, 0)`; };

  useLayoutEffect(() => { if (containerH) place(yOf(snap)); }); // runs every render: cheap and always correct
  useLayoutEffect(() => { if (body.current) body.current.inert = snap === "peek"; }, [snap]); // hidden content must not take focus

  const down = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ref.current.dataset.dragging = "true";
    const t0 = yOf(snap);
    drag.current = { y0: e.clientY, t0, y: t0, moved: false, v: 0, ly: e.clientY, lt: e.timeStamp };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) > 6) d.moved = true;
    if (!d.moved) return;
    d.y = Math.min(Math.max(d.t0 + dy, 0), yOf("peek"));
    const dt = e.timeStamp - d.lt;
    if (dt > 0) d.v = (e.clientY - d.ly) / dt;
    d.ly = e.clientY; d.lt = e.timeStamp;
    place(d.y);
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    ref.current.dataset.dragging = "false";
    if (!d) return;
    if (!d.moved) return onSnapChange(snap === "peek" ? "half" : "peek");
    const projected = d.y + d.v * 180; // fling momentum
    const next = ORDER.reduce((best, s) => (Math.abs(yOf(s) - projected) < Math.abs(yOf(best) - projected) ? s : best), "peek");
    place(yOf(next));
    onSnapChange(next);
  };
  const key = (e) => {
    const i = ORDER.indexOf(snap);
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSnapChange(snap === "peek" ? "half" : "peek"); }
    else if (e.key === "ArrowUp") { e.preventDefault(); onSnapChange(ORDER[Math.min(2, i + 1)]); }
    else if (e.key === "ArrowDown") { e.preventDefault(); onSnapChange(ORDER[Math.max(0, i - 1)]); }
  };

  return (
    <section ref={ref} className="cm-sheet" data-snap={snap} data-dragging="false" style={{ height: full }} aria-label={label}
      onKeyDown={(e) => e.key === "Escape" && snap !== "peek" && onSnapChange("peek")}>
      <div className="cm-sheet-head" role="button" tabIndex={0} aria-expanded={snap !== "peek"}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
        <span className="cm-grab" aria-hidden="true" />
        <span className="cm-sr">Press Enter to expand or collapse the details panel</span>
        {header}
      </div>
      <div ref={body} className="cm-sheet-body" style={{ paddingBottom: full - sheetVisible(snap, containerH) + 16 }}>
        {children}
      </div>
    </section>
  );
}
