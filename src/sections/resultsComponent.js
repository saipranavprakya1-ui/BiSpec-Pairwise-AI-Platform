import resultsData from '../data/results.json';

/**
 * BiSpec Results Section Component
 * Renders data-driven SVG charts:
 *  1. Grouped Bar Chart for Binding Affinity (KD nM)
 *  2. Dose-Response Curve with Log X-Axis & EC50 Marker
 *  3. Selectivity Heatmap Matrix
 *
 * Features:
 *  - All copy and values driven by results.json
 *  - Subtle "Illustrative data" tags on placeholder items
 *  - Accessible data table fallback toggles
 *  - IntersectionObserver entrance animation
 *  - Reduced-motion compliance
 */
export class ResultsComponent {
  constructor(container) {
    this.container = container;
    this.data = resultsData;
    this.hasAnimated = false;
    this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.render();
    this.setupInteractivity();
    this.setupScrollAnimation();
  }

  render() {
    const { meta, sectionHeader, summaryCards, bindingAffinity, doseResponse, selectivityPanel } = this.data;

    this.container.innerHTML = `
      <div class="results-container">
        <!-- Section Header -->
        <div class="results-header-wrap">
          <div class="kicker-row">
            <span class="section-label" data-placeholder="results-kicker">${sectionHeader.kicker}</span>
            ${meta.isPlaceholder ? `<span class="tag-illustrative" title="Placeholder values for developmental validation">${meta.illustrativeTag}</span>` : ''}
          </div>
          <h2 class="section-heading" data-placeholder="results-heading">${sectionHeader.heading}</h2>
          <p class="section-subhead" data-placeholder="results-subhead">${sectionHeader.subhead}</p>
        </div>

        <!-- 3 Summary Metric Cards -->
        <div class="results-summary-grid">
          ${summaryCards.map((card) => `
            <article class="result-metric-card" id="card-${card.id}">
              <div class="card-top-meta">
                <span class="result-metric-label" data-placeholder="metric-${card.id}-label">${card.label}</span>
                ${card.isPlaceholder ? `<span class="tag-illustrative-sm">${meta.illustrativeTag}</span>` : ''}
              </div>
              <div class="result-metric-val" data-placeholder="metric-${card.id}-val">${card.value}</div>
              <p class="result-metric-context" data-placeholder="metric-${card.id}-context">${card.context}</p>
            </article>
          `).join('')}
        </div>

        <!-- Charts Grid (3 Data-Driven SVG Visualizations) -->
        <div class="results-charts-grid">
          <!-- Chart 1: Grouped Bar Chart (KD) -->
          <div class="chart-card" id="chart-kd-card">
            <div class="chart-header">
              <div>
                <div class="chart-meta-row">
                  <h3 class="chart-title">${bindingAffinity.title}</h3>
                  <span class="tag-illustrative-sm">${meta.illustrativeTag}</span>
                </div>
                <p class="chart-subtitle">${bindingAffinity.subtitle}</p>
              </div>
              <button type="button" class="btn-chart-toggle" data-target="table-kd" aria-expanded="false" aria-controls="table-kd">
                <span>Data Table</span>
                <span class="toggle-arrow" aria-hidden="true">&#9662;</span>
              </button>
            </div>

            <!-- SVG Container -->
            <div class="svg-chart-wrapper" aria-label="${bindingAffinity.title}">
              ${this.renderKdBarChart(bindingAffinity)}
            </div>

            <!-- Accessible Table Fallback -->
            <div class="chart-table-container" id="table-kd" style="display: none;">
              <table class="accessible-data-table" role="table">
                <caption>${bindingAffinity.title} (Surface Plasmon Resonance)</caption>
                <thead>
                  <tr>
                    <th scope="col">Target</th>
                    <th scope="col">Candidate</th>
                    <th scope="col">KD (nM)</th>
                    <th scope="col">Classification</th>
                  </tr>
                </thead>
                <tbody>
                  ${bindingAffinity.categories.map(c => `
                    <tr>
                      <th scope="row">${c.target}</th>
                      <td>${c.bispecLabel}</td>
                      <td><strong>${c.bispecValue} nM</strong></td>
                      <td><span class="status-pill status-completed">High-Affinity Bivalent</span></td>
                    </tr>
                    <tr>
                      <th scope="row">${c.target}</th>
                      <td>${c.refLabel}</td>
                      <td>${c.refValue} nM</td>
                      <td><span class="status-pill status-planned">Monovalent Reference</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div class="chart-notes-text">${bindingAffinity.notes}</div>
            </div>
          </div>

          <!-- Chart 2: Dose-Response Sigmoidal Curve (EC50) -->
          <div class="chart-card" id="chart-dose-card">
            <div class="chart-header">
              <div>
                <div class="chart-meta-row">
                  <h3 class="chart-title">${doseResponse.title}</h3>
                  <span class="tag-illustrative-sm">${meta.illustrativeTag}</span>
                </div>
                <p class="chart-subtitle">${doseResponse.subtitle}</p>
              </div>
              <button type="button" class="btn-chart-toggle" data-target="table-dose" aria-expanded="false" aria-controls="table-dose">
                <span>Data Table</span>
                <span class="toggle-arrow" aria-hidden="true">&#9662;</span>
              </button>
            </div>

            <!-- SVG Container -->
            <div class="svg-chart-wrapper" aria-label="${doseResponse.title}">
              ${this.renderDoseResponseCurve(doseResponse)}
            </div>

            <!-- Accessible Table Fallback -->
            <div class="chart-table-container" id="table-dose" style="display: none;">
              <table class="accessible-data-table" role="table">
                <caption>${doseResponse.title} (Concentration Titration vs Lysis)</caption>
                <thead>
                  <tr>
                    <th scope="col">Concentration (pM)</th>
                    <th scope="col">Target Tumor Lysis (%)</th>
                    <th scope="col">Antigen- Control Lysis (%)</th>
                  </tr>
                </thead>
                <tbody>
                  ${doseResponse.dataPoints.map(p => `
                    <tr ${p.conc === doseResponse.ec50Value ? 'class="highlight-row"' : ''}>
                      <th scope="row">${p.conc} pM ${p.conc === doseResponse.ec50Value ? '(EC50)' : ''}</th>
                      <td><strong>${p.response}%</strong></td>
                      <td>${(p.conc > 100 ? 2.8 : 1.4).toFixed(1)}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div class="chart-notes-text">${doseResponse.notes}</div>
            </div>
          </div>

          <!-- Chart 3: Selectivity Heatmap Panel -->
          <div class="chart-card" id="chart-selectivity-card" style="grid-column: 1 / -1;">
            <div class="chart-header">
              <div>
                <div class="chart-meta-row">
                  <h3 class="chart-title">${selectivityPanel.title}</h3>
                  <span class="tag-illustrative-sm">${meta.illustrativeTag}</span>
                </div>
                <p class="chart-subtitle">${selectivityPanel.subtitle}</p>
              </div>
              <button type="button" class="btn-chart-toggle" data-target="table-selectivity" aria-expanded="false" aria-controls="table-selectivity">
                <span>Data Table</span>
                <span class="toggle-arrow" aria-hidden="true">&#9662;</span>
              </button>
            </div>

            <!-- SVG Container -->
            <div class="svg-chart-wrapper" aria-label="${selectivityPanel.title}">
              ${this.renderSelectivityHeatmap(selectivityPanel)}
            </div>

            <!-- Accessible Table Fallback -->
            <div class="chart-table-container" id="table-selectivity" style="display: none;">
              <table class="accessible-data-table" role="table">
                <caption>${selectivityPanel.title} (Normalized Activation Index)</caption>
                <thead>
                  <tr>
                    <th scope="col">Biological Sample</th>
                    <th scope="col">Classification</th>
                    ${selectivityPanel.columns.map(col => `<th scope="col">${col}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${selectivityPanel.rows.map(r => `
                    <tr>
                      <th scope="row">${r.sample}</th>
                      <td><span class="status-pill ${r.category.includes('Target') ? 'status-completed' : 'status-planned'}">${r.category}</span></td>
                      ${r.values.map(v => `<td><strong>${v.toFixed(2)}</strong></td>`).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div class="chart-notes-text">${selectivityPanel.notes}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render KD Grouped Bar Chart (Plain SVG)
   */
  renderKdBarChart(data) {
    const w = 560;
    const h = 320;
    const padL = 60;
    const padR = 40;
    const padT = 45;
    const padB = 65;
    const plotH = h - padT - padB; // 210
    const maxVal = 20.0;
    const baselineY = padT + plotH; // 255

    const yTicks = [0, 5, 10, 15, 20];
    const getY = (val) => baselineY - (Math.min(maxVal, val) / maxVal) * plotH;

    // Group X positions
    const group1CenterX = padL + 115;
    const group2CenterX = padL + 345;
    const barW = 38;
    const barGap = 12;

    const cat1 = data.categories[0];
    const cat2 = data.categories[1];

    const c1BispecH = (cat1.bispecValue / maxVal) * plotH;
    const c1RefH = (cat1.refValue / maxVal) * plotH;
    const c2BispecH = (cat2.bispecValue / maxVal) * plotH;
    const c2RefH = (cat2.refValue / maxVal) * plotH;

    return `
      <svg class="svg-chart chart-kd" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="barGradA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--color-a)" stop-opacity="0.95" />
            <stop offset="100%" stop-color="var(--color-a)" stop-opacity="0.65" />
          </linearGradient>
          <linearGradient id="barGradB" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--color-b)" stop-opacity="0.95" />
            <stop offset="100%" stop-color="var(--color-b)" stop-opacity="0.65" />
          </linearGradient>
        </defs>

        <!-- Grid Lines & Y-Axis Labels -->
        <g class="chart-grid">
          ${yTicks.map(t => {
            const y = getY(t);
            return `
              <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--primary-soft)" stroke-dasharray="3 4" />
              <text x="${padL - 10}" y="${y + 4}" text-anchor="end" fill="var(--color-muted)" font-family="var(--font-mono)" font-size="10">${t}</text>
            `;
          }).join('')}
          <line x1="${padL}" y1="${baselineY}" x2="${w - padR}" y2="${baselineY}" stroke="var(--tint)" />
          <text x="${padL - 10}" y="${padT - 18}" text-anchor="start" fill="var(--color-dots)" font-family="var(--font-mono)" font-size="9" letter-spacing="0.08em">KD (nM) &bull; LOWER IS BETTER</text>
        </g>

        <!-- Category 1: Target A -->
        <g class="bar-group" id="group-target-a">
          <!-- BiSpec Bar (Teal) -->
          <rect
            class="anim-bar bar-bispec-a"
            x="${group1CenterX - barW - barGap / 2}"
            y="${baselineY - c1BispecH}"
            width="${barW}"
            height="${c1BispecH}"
            rx="4"
            fill="url(#barGradA)"
            data-target-y="${baselineY - c1BispecH}"
            data-target-h="${c1BispecH}"
          />
          <text class="bar-val-text" x="${group1CenterX - barW / 2 - barGap / 2}" y="${baselineY - c1BispecH - 6}" text-anchor="middle" font-family="var(--font-mono)" font-size="10" font-weight="600" fill="var(--color-a)">${cat1.bispecValue}</text>

          <!-- Reference Bar (Muted) -->
          <rect
            class="anim-bar bar-ref"
            x="${group1CenterX + barGap / 2}"
            y="${baselineY - c1RefH}"
            width="${barW}"
            height="${c1RefH}"
            rx="4"
            fill="var(--tint)"
            stroke="var(--tint)"
            data-target-y="${baselineY - c1RefH}"
            data-target-h="${c1RefH}"
          />
          <text class="bar-val-text" x="${group1CenterX + barW / 2 + barGap / 2}" y="${baselineY - c1RefH - 6}" text-anchor="middle" font-family="var(--font-mono)" font-size="10" fill="var(--color-muted)">${cat1.refValue}</text>

          <!-- Label -->
          <text x="${group1CenterX}" y="${baselineY + 22}" text-anchor="middle" font-family="var(--font-mono)" font-size="11" font-weight="500" fill="var(--color-paper)">Target A (Tumor)</text>
          <text x="${group1CenterX}" y="${baselineY + 38}" text-anchor="middle" font-family="var(--font-mono)" font-size="9" fill="var(--color-muted)">10.8x Higher Affinity</text>
        </g>

        <!-- Category 2: Target B -->
        <g class="bar-group" id="group-target-b">
          <!-- BiSpec Bar (Amber) -->
          <rect
            class="anim-bar bar-bispec-b"
            x="${group2CenterX - barW - barGap / 2}"
            y="${baselineY - c2BispecH}"
            width="${barW}"
            height="${c2BispecH}"
            rx="4"
            fill="url(#barGradB)"
            data-target-y="${baselineY - c2BispecH}"
            data-target-h="${c2BispecH}"
          />
          <text class="bar-val-text" x="${group2CenterX - barW / 2 - barGap / 2}" y="${baselineY - c2BispecH - 6}" text-anchor="middle" font-family="var(--font-mono)" font-size="10" font-weight="600" fill="var(--color-b)">${cat2.bispecValue}</text>

          <!-- Reference Bar (Muted) -->
          <rect
            class="anim-bar bar-ref"
            x="${group2CenterX + barGap / 2}"
            y="${baselineY - c2RefH}"
            width="${barW}"
            height="${c2RefH}"
            rx="4"
            fill="var(--tint)"
            stroke="var(--tint)"
            data-target-y="${baselineY - c2RefH}"
            data-target-h="${c2RefH}"
          />
          <text class="bar-val-text" x="${group2CenterX + barW / 2 + barGap / 2}" y="${baselineY - c2RefH - 6}" text-anchor="middle" font-family="var(--font-mono)" font-size="10" fill="var(--color-muted)">${cat2.refValue}</text>

          <!-- Label -->
          <text x="${group2CenterX}" y="${baselineY + 22}" text-anchor="middle" font-family="var(--font-mono)" font-size="11" font-weight="500" fill="var(--color-paper)">Target B (Effector)</text>
          <text x="${group2CenterX}" y="${baselineY + 38}" text-anchor="middle" font-family="var(--font-mono)" font-size="9" fill="var(--color-muted)">12.8x Higher Affinity</text>
        </g>

        <!-- Chart Legend -->
        <g class="chart-legend" transform="translate(${w - padR - 190}, ${padT - 22})">
          <rect x="0" y="0" width="10" height="10" rx="2" fill="var(--color-a)" />
          <text x="14" y="9" font-family="var(--font-mono)" font-size="9" fill="var(--color-dots)">BiSpec</text>
          <rect x="75" y="0" width="10" height="10" rx="2" fill="var(--primary)" />
          <text x="89" y="9" font-family="var(--font-mono)" font-size="9" fill="var(--color-muted)">Monovalent mAb</text>
        </g>
      </svg>
    `;
  }

  /**
   * Render Dose-Response Sigmoidal Curve (Plain SVG)
   */
  renderDoseResponseCurve(data) {
    const w = 560;
    const h = 320;
    const padL = 55;
    const padR = 40;
    const padT = 40;
    const padB = 60;
    const plotW = w - padL - padR; // 465
    const plotH = h - padT - padB; // 220
    const baselineY = padT + plotH; // 260

    // Log10 range from -2 (0.01 pM) to 4 (10,000 pM) -> 6 decades
    const minLog = -2.0;
    const maxLog = 4.0;
    const spanLog = maxLog - minLog; // 6

    const getX = (conc) => {
      const logVal = Math.log10(conc);
      return padL + ((logVal - minLog) / spanLog) * plotW;
    };

    const getY = (resp) => baselineY - (resp / 100.0) * plotH;

    // Generate smooth 4PL curve coordinates
    const { bottom, top, logEC50, hillSlope } = {
      bottom: 2.5,
      top: 98.4,
      logEC50: Math.log10(data.ec50Value), // ~1.152
      hillSlope: 1.25
    };

    let curvePath = '';
    const numPoints = 80;
    for (let i = 0; i <= numPoints; i++) {
      const currLog = minLog + (i / numPoints) * spanLog;
      const conc = Math.pow(10, currLog);
      // 4-parameter logistic equation
      const resp = bottom + (top - bottom) / (1.0 + Math.pow(10, (logEC50 - currLog) * hillSlope));
      const px = getX(conc);
      const py = getY(resp);
      curvePath += (i === 0 ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : ` L ${px.toFixed(1)} ${py.toFixed(1)}`);
    }

    // Control flat baseline line
    const ctrlY = getY(2.5);
    const ctrlPath = `M ${padL} ${ctrlY.toFixed(1)} L ${padL + plotW} ${ctrlY.toFixed(1)}`;

    // Marker coordinates for EC50
    const ec50X = getX(data.ec50Value);
    const ec50Y = getY(50.0);

    // X-axis log ticks
    const logTicks = [
      { conc: 0.01, label: '0.01' },
      { conc: 0.1, label: '0.1' },
      { conc: 1.0, label: '1' },
      { conc: 10.0, label: '10' },
      { conc: 100.0, label: '100' },
      { conc: 1000.0, label: '1k' },
      { conc: 10000.0, label: '10k' }
    ];

    const yTicks = [0, 25, 50, 75, 100];

    return `
      <svg class="svg-chart chart-dose" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="glow-ec50" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- Grid Lines & Y Axis -->
        <g class="chart-grid">
          ${yTicks.map(t => {
            const y = getY(t);
            return `
              <line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="var(--chart-grid)" stroke-dasharray="${t === 50 ? '4 4' : '2 4'}" />
              <text x="${padL - 10}" y="${y + 4}" text-anchor="end" fill="${t === 50 ? 'var(--color-a)' : 'var(--color-muted)'}" font-family="var(--font-mono)" font-size="10">${t}%</text>
            `;
          }).join('')}
          <text x="${padL - 10}" y="${padT - 16}" text-anchor="start" fill="var(--color-dots)" font-family="var(--font-mono)" font-size="9" letter-spacing="0.08em">SPECIFIC LYSIS (%)</text>
        </g>

        <!-- X Axis Log Ticks -->
        <g class="chart-x-axis">
          ${logTicks.map(t => {
            const x = getX(t.conc);
            return `
              <line x1="${x}" y1="${baselineY}" x2="${x}" y2="${baselineY + 6}" stroke="var(--tint)" />
              <text x="${x}" y="${baselineY + 20}" text-anchor="middle" fill="var(--color-muted)" font-family="var(--font-mono)" font-size="10">${t.label}</text>
            `;
          }).join('')}
          <line x1="${padL}" y1="${baselineY}" x2="${padL + plotW}" y2="${baselineY}" stroke="var(--tint)" />
          <text x="${padL + plotW / 2}" y="${baselineY + 40}" text-anchor="middle" fill="var(--color-dots)" font-family="var(--font-mono)" font-size="10" letter-spacing="0.06em">CONCENTRATION (pM, LOG10 SCALE)</text>
        </g>

        <!-- EC50 Dashed Drop Lines -->
        <g class="ec50-crosshair">
          <line x1="${ec50X}" y1="${ec50Y}" x2="${ec50X}" y2="${baselineY}" stroke="var(--color-a)" stroke-dasharray="3 3" opacity="0.65" />
          <line x1="${padL}" y1="${ec50Y}" x2="${ec50X}" y2="${ec50Y}" stroke="var(--color-a)" stroke-dasharray="3 3" opacity="0.65" />
        </g>

        <!-- Antigen- Control Curve (Muted Dashed) -->
        <path d="${ctrlPath}" fill="none" stroke="var(--color-muted)" stroke-width="1.8" stroke-dasharray="4 4" opacity="0.6" />

        <!-- BiSpec Sigmoidal Curve (Animated Teal Path) -->
        <path
          class="anim-curve-path"
          d="${curvePath}"
          fill="none"
          stroke="var(--color-a)"
          stroke-width="2.5"
          stroke-linecap="round"
        />

        <!-- Experimental Data Points -->
        <g class="data-points-group">
          ${data.dataPoints.map(p => `
            <circle cx="${getX(p.conc).toFixed(1)}" cy="${getY(p.response).toFixed(1)}" r="3.2" fill="var(--color-night)" stroke="var(--color-a)" stroke-width="1.8" />
          `).join('')}
        </g>

        <!-- EC50 Highlight Beacon Node -->
        <g class="ec50-marker" transform="translate(${ec50X.toFixed(1)}, ${ec50Y.toFixed(1)})">
          <circle cx="0" cy="0" r="8" fill="var(--tint)" class="pulse-beacon" />
          <circle cx="0" cy="0" r="4.5" fill="var(--color-a)" filter="url(#glow-ec50)" />
          <!-- Tag Capsule -->
          <rect x="8" y="-22" width="104" height="20" rx="4" fill="var(--ink)" stroke="var(--color-a)" stroke-width="1" />
          <text x="14" y="-8" fill="var(--color-a)" font-family="var(--font-mono)" font-size="10" font-weight="600">EC50 = 14.2 pM</text>
        </g>

        <!-- Chart Legend -->
        <g class="chart-legend" transform="translate(${padL + 10}, ${padT + 12})">
          <line x1="0" y1="5" x2="16" y2="5" stroke="var(--color-a)" stroke-width="2.5" />
          <text x="22" y="9" font-family="var(--font-mono)" font-size="9" fill="var(--color-paper)">BiSpec Dual-Engaged</text>
          <line x1="140" y1="5" x2="156" y2="5" stroke="var(--color-muted)" stroke-width="1.8" stroke-dasharray="3 3" />
          <text x="162" y="9" font-family="var(--font-mono)" font-size="9" fill="var(--color-muted)">Antigen- Control</text>
        </g>
      </svg>
    `;
  }

  /**
   * Render Selectivity Heatmap Panel (Plain SVG)
   */
  renderSelectivityHeatmap(data) {
    const w = 560;
    const h = 310;
    const padL = 175;
    const padR = 25;
    const padT = 55;
    const padB = 45;
    const plotW = w - padL - padR; // 360
    const colW = plotW / 4; // 90
    const rowH = 32;

    const getCellColor = (val) => {
      if (val >= 0.8) {
        return { fill: 'var(--primary)', stroke: 'var(--color-a)', textColor: 'var(--ink)' };
      }
      if (val >= 0.3) {
        return { fill: 'var(--accent)', stroke: 'var(--color-b)', textColor: 'var(--ink)' };
      }
      if (val >= 0.1) {
        return { fill: 'var(--accent-soft)', stroke: 'var(--accent)', textColor: 'var(--color-paper)' };
      }
      return { fill: 'var(--border)', stroke: 'var(--primary-soft)', textColor: 'var(--color-muted)' };
    };

    return `
      <svg class="svg-chart chart-heatmap" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
        <!-- Column Headers -->
        <g class="heatmap-col-headers">
          ${data.columns.map((col, idx) => {
            const x = padL + idx * colW + colW / 2;
            return `
              <text x="${x}" y="${padT - 14}" text-anchor="middle" font-family="var(--font-mono)" font-size="9.5" fill="var(--color-dots)">${col}</text>
            `;
          }).join('')}
        </g>

        <!-- Rows & Heatmap Cells -->
        <g class="heatmap-rows">
          ${data.rows.map((row, rIdx) => {
            const y = padT + rIdx * rowH;
            return `
              <!-- Row Label -->
              <text x="${padL - 14}" y="${y + rowH / 2 + 4}" text-anchor="end" font-family="var(--font-sans)" font-size="11" fill="var(--color-paper)">
                ${row.sample}
                <tspan fill="var(--color-muted)" font-family="var(--font-mono)" font-size="8.5"> (${row.category})</tspan>
              </text>

              <!-- Row Cells -->
              ${row.values.map((val, cIdx) => {
                const cx = padL + cIdx * colW + 4;
                const cellW = colW - 8;
                const cellH = rowH - 6;
                const style = getCellColor(val);
                return `
                  <rect
                    class="anim-heatmap-cell"
                    x="${cx}"
                    y="${y + 3}"
                    width="${cellW}"
                    height="${cellH}"
                    rx="4"
                    fill="${style.fill}"
                    stroke="${style.stroke}"
                    stroke-width="1"
                    data-val="${val.toFixed(2)}"
                  />
                  <text
                    x="${cx + cellW / 2}"
                    y="${y + cellH / 2 + 7}"
                    text-anchor="middle"
                    font-family="var(--font-mono)"
                    font-size="10.5"
                    font-weight="${val > 0.5 ? '600' : '400'}"
                    fill="${style.textColor}"
                  >${val.toFixed(2)}</text>
                `;
              }).join('')}
            `;
          }).join('')}
        </g>

        <!-- Color Gradient Scale Legend -->
        <g class="heatmap-legend" transform="translate(${padL}, ${h - padB + 16})">
          <text x="-12" y="10" text-anchor="end" font-family="var(--font-mono)" font-size="8.5" fill="var(--color-muted)">0.0 (No Cytolysis)</text>
          <rect x="0" y="2" width="50" height="10" rx="2" fill="var(--border)" stroke="var(--primary-soft)" />
          <rect x="56" y="2" width="50" height="10" rx="2" fill="var(--accent-soft)" />
          <rect x="112" y="2" width="50" height="10" rx="2" fill="var(--accent)" />
          <rect x="168" y="2" width="60" height="10" rx="2" fill="var(--primary)" />
          <text x="236" y="10" text-anchor="start" font-family="var(--font-mono)" font-size="8.5" fill="var(--color-a)">1.0 (Full Activation)</text>
        </g>
      </svg>
    `;
  }

  setupInteractivity() {
    // Accessible Data Table Toggles
    const toggleBtns = this.container.querySelectorAll('.btn-chart-toggle');
    toggleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const tableContainer = this.container.querySelector(`#${targetId}`);
        if (tableContainer) {
          const isHidden = tableContainer.style.display === 'none';
          tableContainer.style.display = isHidden ? 'block' : 'none';
          btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
          btn.classList.toggle('active', isHidden);
          const textSpan = btn.querySelector('span:first-child');
          if (textSpan) {
            textSpan.textContent = isHidden ? 'Hide Table' : 'Data Table';
          }
        }
      });
    });
  }

  setupScrollAnimation() {
    if (this.isReducedMotion) {
      this.animateChartsImmediate();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.hasAnimated) {
            this.hasAnimated = true;
            this.animateCharts();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(this.container);
  }

  animateCharts() {
    // 1. Animate KD bars growth
    const bars = this.container.querySelectorAll('.anim-bar');
    bars.forEach((bar) => {
      const targetH = parseFloat(bar.dataset.targetH);
      const targetY = parseFloat(bar.dataset.targetY);

      bar.style.transition = 'height 0.8s cubic-bezier(0.16, 1, 0.3, 1), y 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
      bar.setAttribute('height', targetH);
      bar.setAttribute('y', targetY);
    });

    // 2. Animate Dose Curve stroke dashoffset
    const curvePath = this.container.querySelector('.anim-curve-path');
    if (curvePath) {
      const length = curvePath.getTotalLength ? curvePath.getTotalLength() : 600;
      curvePath.style.strokeDasharray = length;
      curvePath.style.strokeDashoffset = length;
      curvePath.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
      requestAnimationFrame(() => {
        curvePath.style.strokeDashoffset = '0';
      });
    }

    // 3. Animate Heatmap cells
    const cells = this.container.querySelectorAll('.anim-heatmap-cell');
    cells.forEach((cell, idx) => {
      cell.style.opacity = '0';
      cell.style.transition = `opacity 0.4s ease ${idx * 20}ms`;
      requestAnimationFrame(() => {
        cell.style.opacity = '1';
      });
    });
  }

  animateChartsImmediate() {
    const bars = this.container.querySelectorAll('.anim-bar');
    bars.forEach((bar) => {
      bar.setAttribute('height', bar.dataset.targetH);
      bar.setAttribute('y', bar.dataset.targetY);
    });
  }
}

export function initResultsSection(container) {
  if (!container) return null;
  const instance = new ResultsComponent(container);
  window.__resultsComponent = instance;
  return instance;
}
