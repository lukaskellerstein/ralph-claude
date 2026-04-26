import { useEffect, useMemo, useRef, useState } from "react";
import { select as d3Select } from "d3-selection";
import { zoom as d3Zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { linkVertical } from "d3-shape";
import {
  layoutTimeline,
  type LaidOutNode,
  type LaidOutEdge,
  type LayoutOutput,
} from "../timelineLayout";
import type { TimelineSnapshot } from "../../../../core/checkpoints.js";

const LAYOUT_OPTIONS = {
  laneWidth: 170,
  rowHeight: 30,
  headerHeight: 40,
  gutterGap: 36,
};

/**
 * Owns the imperative d3 state behind TimelineGraph: svg ref, layout memos,
 * pan/zoom transform, hover state, and d3-shape link generator.
 *
 * Extracted from TimelineGraph so the d3 lifecycle is unit-testable without
 * mounting the full SVG tree, and so future timeline visualizations can reuse
 * the same pan/zoom + layout pipeline.
 */
export function useD3Timeline(snapshot: TimelineSnapshot) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<LaidOutNode | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

  const layout: LayoutOutput = useMemo(
    () => layoutTimeline(snapshot, LAYOUT_OPTIONS),
    [snapshot],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const zoom = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on("zoom", (event) => {
        setTransform(event.transform);
      });
    const sel = d3Select(svg);
    sel.call(zoom);
    return () => {
      sel.on(".zoom", null);
    };
  }, []);

  const nodeById = useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, n])),
    [layout.nodes],
  );

  const linkGen = useMemo(
    () =>
      linkVertical<LaidOutEdge, { x: number; y: number }>()
        .source((e) => {
          // Edges with an explicit fromPoint (e.g. "trunk-sprout") originate
          // from a phantom point on the trunk lane, not from a real node.
          if (e.fromPoint) return e.fromPoint;
          const n = nodeById.get(e.fromId);
          return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
        })
        .target((e) => {
          const n = nodeById.get(e.toId);
          return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
        })
        .x((p) => p.x)
        .y((p) => p.y),
    [nodeById],
  );

  return {
    svgRef,
    layout,
    nodeById,
    linkGen,
    transform,
    hovered,
    setHovered,
  };
}
