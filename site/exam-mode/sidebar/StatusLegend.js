export function legendHtml(controller) {
  const c = controller.counts();
  return `
    <div class="legend-grid" id="legend-grid">
      <div class="legend-tile">
        <span class="legend-swatch swatch-answered">${c.answered}</span>
        <span>Answered</span>
      </div>
      <div class="legend-tile">
        <span class="legend-swatch swatch-not-answered">${c.notAnswered}</span>
        <span>Not Answered</span>
      </div>
      <div class="legend-tile">
        <span class="legend-swatch swatch-not-visited">${c.notVisited}</span>
        <span>Not Visited</span>
      </div>
      <div class="legend-tile">
        <span class="legend-swatch swatch-marked">${c.marked}</span>
        <span>Marked For Review</span>
      </div>
      <div class="legend-tile wide">
        <span class="legend-swatch swatch-answered-marked">${c.answeredMarked}<span class="swatch-check">✓</span></span>
        <span>Answered and Marked For Review (will be considered for evaluation)</span>
      </div>
    </div>`;
}

export class StatusLegend {
  static render(container, controller) {
    container.innerHTML = legendHtml(controller);
  }
}
