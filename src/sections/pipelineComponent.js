import pipelineData from '../data/pipeline.json';

/**
 * BiSpec Translational Pipeline Section Component
 * Renders data-driven horizontal timeline (desktop) and vertical timeline (mobile).
 * All text and milestone statuses are loaded directly from src/data/pipeline.json.
 */
export class PipelineComponent {
  constructor(container) {
    this.container = container;
    this.data = pipelineData;

    this.render();
  }

  render() {
    const { meta, sectionHeader, stages } = this.data;

    this.container.innerHTML = `
      <div class="pipeline-section-wrapper">
        <!-- Section Header -->
        <div class="pipeline-header-wrap">
          <div class="kicker-row">
            <span class="section-label" data-placeholder="pipeline-kicker">${sectionHeader.kicker}</span>
            ${meta.isPlaceholder ? `<span class="tag-illustrative">${meta.illustrativeTag}</span>` : ''}
          </div>
          <h2 class="section-heading" data-placeholder="pipeline-heading">${sectionHeader.heading}</h2>
          <p class="section-subhead" data-placeholder="pipeline-subhead">${sectionHeader.subhead}</p>
        </div>

        <!-- Timeline Container (Horizontal on Desktop, Vertical on Mobile) -->
        <div class="pipeline-timeline-track" role="list" aria-label="Model Architecture Evolution Stages">
          <!-- Continuous Connection Rail -->
          <div class="timeline-rail" aria-hidden="true">
            <div class="timeline-rail-progress"></div>
          </div>

          <!-- Stage Nodes -->
          ${stages.map((stage, idx) => {
            const isComplete = stage.status === 'complete';
            const isActive = stage.status === 'active';
            const isPlanned = stage.status === 'planned';

            let statusClass = 'status-planned';
            if (isComplete) statusClass = 'status-completed';
            if (isActive) statusClass = 'status-active';

            return `
              <article class="timeline-stage-node stage-${stage.status}" role="listitem" id="${stage.id}">
                <!-- Node Icon Marker -->
                <div class="node-marker-wrap">
                  <div class="node-circle ${statusClass}" aria-hidden="true">
                    ${isComplete ? `
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ` : ''}
                    ${isActive ? `
                      <span class="pulse-active-dot"></span>
                    ` : ''}
                    ${isPlanned ? `
                      <span class="planned-dot"></span>
                    ` : ''}
                  </div>
                </div>

                <!-- Stage Content Card -->
                <div class="stage-card-body">
                  <div class="stage-top-meta">
                    <span class="stage-index">${stage.index}</span>
                    <span class="status-pill ${statusClass}">${stage.statusLabel}</span>
                  </div>

                  <h3 class="stage-name">${stage.name}</h3>
                  <div class="stage-timeline-badge">${stage.timeline}</div>
                  <p class="stage-desc">${stage.description}</p>

                  <!-- Key Milestones List -->
                  <div class="stage-milestones-list">
                    <div class="milestones-label">Key Architectural Highlights</div>
                    <ul>
                      ${stage.keyMilestones.map(m => `<li>${m}</li>`).join('')}
                    </ul>
                  </div>

                  ${stage.isPlaceholder ? `
                    <div class="stage-footer-tag">
                      <span class="tag-illustrative-sm">${meta.illustrativeTag}</span>
                    </div>
                  ` : ''}
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
}

export function initPipelineSection(container) {
  if (!container) return null;
  const instance = new PipelineComponent(container);
  window.__pipelineComponent = instance;
  return instance;
}
