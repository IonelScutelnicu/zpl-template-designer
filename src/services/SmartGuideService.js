// Smart Guide Service
// Detects alignment between dragged element and other elements/label edges

import { getElementBoundsResolved } from '../utils/geometry.js';

const SNAP_THRESHOLD = 5; // dots

/**
 * Service for detecting smart alignment guides during element drag
 */
export class SmartGuideService {
  /**
   * Detect alignment guides for a dragged element
   * @param {Object} dragElement - Element being dragged
   * @param {number} proposedX - Proposed new X position
   * @param {number} proposedY - Proposed new Y position
   * @param {Array} allElements - All elements on the label
   * @param {Object} labelSettings - Label configuration
   * @param {Object} renderer - Canvas renderer (for TEXT measurement)
   * @returns {Object} { guides: [{axis, position, type}], snapX: number|null, snapY: number|null }
   */
  detectGuides(dragElement, proposedX, proposedY, allElements, labelSettings, renderer) {
    const actualDpi = Math.floor(labelSettings.dpmm * 25.4);
    const labelW = Math.floor((labelSettings.width / 25.4) * actualDpi);
    const labelH = Math.floor((labelSettings.height / 25.4) * actualDpi);

    // Get bounds of the dragged element at the proposed position
    const dragBounds = this._getBoundsAtPosition(dragElement, proposedX, proposedY, labelSettings, renderer);

    // Collect all reference edges (other elements + label)
    const refEdges = this._collectReferenceEdges(dragElement, allElements, labelSettings, renderer, labelW, labelH);

    // Dragged element edges
    const dragEdgesX = {
      left: dragBounds.x,
      center: dragBounds.x + dragBounds.width / 2,
      right: dragBounds.x + dragBounds.width
    };
    const dragEdgesY = {
      top: dragBounds.y,
      center: dragBounds.y + dragBounds.height / 2,
      bottom: dragBounds.y + dragBounds.height
    };

    const guides = [];
    let snapX = null;
    let snapY = null;
    let bestDistX = SNAP_THRESHOLD + 1;
    let bestDistY = SNAP_THRESHOLD + 1;

    // Check X-axis alignment
    for (const [dragEdgeName, dragEdgeVal] of Object.entries(dragEdgesX)) {
      for (const ref of refEdges.x) {
        const dist = Math.abs(dragEdgeVal - ref.position);
        if (dist <= SNAP_THRESHOLD && dist < bestDistX) {
          bestDistX = dist;
          // Calculate the snap offset: how much to shift element.x
          const offset = ref.position - dragEdgeVal;
          snapX = proposedX + offset;
          // Clear previous x guides and add this one
          guides.splice(0, guides.length, ...guides.filter(g => g.axis !== 'x'));
          guides.push({ axis: 'x', position: ref.position, type: ref.type });
        } else if (dist <= SNAP_THRESHOLD && dist === bestDistX) {
          // Add additional guide at same distance
          guides.push({ axis: 'x', position: ref.position, type: ref.type });
        }
      }
    }

    // Check Y-axis alignment
    for (const [dragEdgeName, dragEdgeVal] of Object.entries(dragEdgesY)) {
      for (const ref of refEdges.y) {
        const dist = Math.abs(dragEdgeVal - ref.position);
        if (dist <= SNAP_THRESHOLD && dist < bestDistY) {
          bestDistY = dist;
          const offset = ref.position - dragEdgeVal;
          snapY = proposedY + offset;
          // Clear previous y guides and keep x guides
          const xGuides = guides.filter(g => g.axis === 'x');
          guides.length = 0;
          guides.push(...xGuides);
          guides.push({ axis: 'y', position: ref.position, type: ref.type });
        } else if (dist <= SNAP_THRESHOLD && dist === bestDistY) {
          guides.push({ axis: 'y', position: ref.position, type: ref.type });
        }
      }
    }

    // Deduplicate guides by axis+position
    const unique = [];
    const seen = new Set();
    for (const g of guides) {
      const key = `${g.axis}:${g.position}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(g);
      }
    }

    return { guides: unique, snapX, snapY };
  }

  /**
   * Get element bounds at a proposed position
   */
  _getBoundsAtPosition(element, proposedX, proposedY, labelSettings, renderer) {
    // Temporarily set position to get bounds
    const origX = element.x;
    const origY = element.y;
    element.x = proposedX;
    element.y = proposedY;

    let bounds;
    if (element.type === 'TEXT' && renderer) {
      bounds = renderer.measureTextBounds(element, labelSettings);
    } else {
      bounds = getElementBoundsResolved(element, labelSettings);
    }

    // Restore original position
    element.x = origX;
    element.y = origY;

    return bounds;
  }

  /**
   * Collect all reference edges from other elements and label boundaries
   */
  _collectReferenceEdges(dragElement, allElements, labelSettings, renderer, labelW, labelH) {
    const xEdges = [];
    const yEdges = [];

    // Label edges and center
    xEdges.push({ position: 0, type: 'label-edge' });
    xEdges.push({ position: Math.round(labelW / 2), type: 'label-center' });
    xEdges.push({ position: labelW, type: 'label-edge' });

    yEdges.push({ position: 0, type: 'label-edge' });
    yEdges.push({ position: Math.round(labelH / 2), type: 'label-center' });
    yEdges.push({ position: labelH, type: 'label-edge' });

    // Other elements
    for (const el of allElements) {
      if (el.id === dragElement.id) continue;

      let bounds;
      if (el.type === 'TEXT' && renderer) {
        bounds = renderer.measureTextBounds(el, labelSettings);
      } else {
        bounds = getElementBoundsResolved(el, labelSettings);
      }

      // X edges: left, center, right
      xEdges.push({ position: bounds.x, type: 'element-edge' });
      xEdges.push({ position: Math.round(bounds.x + bounds.width / 2), type: 'element-center' });
      xEdges.push({ position: bounds.x + bounds.width, type: 'element-edge' });

      // Y edges: top, center, bottom
      yEdges.push({ position: bounds.y, type: 'element-edge' });
      yEdges.push({ position: Math.round(bounds.y + bounds.height / 2), type: 'element-center' });
      yEdges.push({ position: bounds.y + bounds.height, type: 'element-edge' });
    }

    return { x: xEdges, y: yEdges };
  }
}
