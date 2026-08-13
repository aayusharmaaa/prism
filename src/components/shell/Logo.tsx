import { cn } from "@/lib/format";

/**
 * Prism's mark: a tetrahedron seen corner-on, with the left face filled.
 *
 * Geometry (24×24 viewBox):
 *   A  apex            (12,   2.6)
 *   L  base left       ( 2.6, 20.4)
 *   R  base right      (21.4, 20.4)
 *   C  interior vertex (12,  13.4)  — ~60% down from the apex
 *
 * The filled A-L-C face is what carries the mark at small sizes; the
 * wireframe alone would be hairlines. Stroke weight is therefore scaled
 * *inversely* to size — heavier relative strokes when small, so the edges
 * survive rasterisation, finer when large so it reads as drawn.
 */

const A = "12 2.6";
const L = "2.6 20.4";
const R = "21.4 20.4";
const C = "12 13.4";

export function Logo({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Thresholds set by rasterising at true pixel sizes, not by eyeballing the
  // vector: below ~28px the interior edges either collide into a blob (heavy
  // stroke) or anti-alias down to grey (light stroke). Neither is worth it.
  //
  // Dropping to silhouette + filled face is a faithful simplification, since
  // the right and bottom faces are both unfilled in the full mark — only the
  // hairline dividing them is lost.
  const detailed = size >= 28;
  const stroke = size >= 64 ? 1.0 : size >= 28 ? 1.5 : 2.1;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
    >
      {/* Filled left face — the mark's visual mass. */}
      <path d={`M${A}L${L}L${C}Z`} fill="currentColor" />

      {/* Outer silhouette. */}
      <path d={`M${A}L${R}L${L}Z`} />

      {/* Interior edges: apex→centre and centre→base-right. */}
      {detailed && (
        <>
          <path d={`M${A}L${C}`} />
          <path d={`M${C}L${R}`} />
        </>
      )}
    </svg>
  );
}
