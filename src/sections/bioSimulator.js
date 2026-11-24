import { CHART_THEME } from '../styles/chartPalette.js';
/**
 * src/sections/bioSimulator.js
 * 1. ConfocalBioSimulator: Real-time 60fps HTML5 Canvas biophysical simulation of
 *    bispecific antibodies diffusing, docking Target A & Target B cells, and
 *    forming glowing cytolytic synapses (with Dose & Bispecific/Monotherapy controls).
 * 2. SynergyHeatmap: Interactive 10x10 symmetric target-pair heatmap with mirrored
 *    (i,j) <-> (j,i) hover highlighting and 1-click launch into Screening Studio.
 * 3. DoseResponseTuner: Interactive 4PL Tumor Killing vs. Normal Tissue Toxicity
 *    curve with real-time Affinity (KD) & Selectivity Window sliders.
 */

import { evaluatePairwiseSynergy, TARGETS_BY_SYMBOL } from '../data/biologicalDatabase.js';

export class ConfocalBioSimulator {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.symA = config.symA || 'CLDN18';
    this.symB = config.symB || 'CD3E';
    this.synergyScore = config.score || 89.6;
    this.mode = 'bispecific'; // 'bispecific' | 'monotherapy'
    this.doseLevel = 60; // 10..100
    this.rafId = null;
    this.disposed = false;
    this.t = 0;

    this.cellsA = [];
    this.cellsB = [];
    this.antibodies = [];
    this.pulses = [];
    this.synapseCount = 0;

    this.resize();
    this.seedEntities();
    this.bindPointer();
    this.loop = this.loop.bind(this);
    this.rafId = requestAnimationFrame(this.loop);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(320, rect.width || 560);
    this.h = Math.max(220, rect.height || 260);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  seedEntities() {
    this.cellsA = [];
    this.cellsB = [];
    this.antibodies = [];

    // 5 Tumor Cells (Target A - Teal)
    for (let i = 0; i < 5; i++) {
      this.cellsA.push({
        x: this.w * (0.16 + Math.random() * 0.28),
        y: this.h * (0.18 + Math.random() * 0.64),
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 22 + Math.random() * 8,
        phase: Math.random() * Math.PI * 2
      });
    }

    // 5 Effector / Co-Target Cells (Target B - Amber)
    for (let i = 0; i < 5; i++) {
      this.cellsB.push({
        x: this.w * (0.56 + Math.random() * 0.28),
        y: this.h * (0.18 + Math.random() * 0.64),
        vx: (Math.random() - 0.5) * 0.42,
        vy: (Math.random() - 0.5) * 0.42,
        r: 18 + Math.random() * 6,
        phase: Math.random() * Math.PI * 2
      });
    }

    this.syncAntibodyCount();
  }

  syncAntibodyCount() {
    const targetCount = Math.max(8, Math.round(this.doseLevel * 0.45));
    while (this.antibodies.length < targetCount) {
      this.antibodies.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 1.4,
        vy: (Math.random() - 0.5) * 1.4,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.04,
        bridged: false
      });
    }
    if (this.antibodies.length > targetCount) {
      this.antibodies.length = targetCount;
    }
  }

  setMode(mode) {
    this.mode = mode;
  }

  setDose(val) {
    this.doseLevel = Number(val) || 60;
    this.syncAntibodyCount();
  }

  bindPointer() {
    this.onClick = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.pulses.push({ x, y, r: 4, alpha: 0.9 });
      for (let i = 0; i < 4; i++) {
        const ang = (Math.PI * 2 * i) / 4 + Math.random();
        this.antibodies.push({
          x,
          y,
          vx: Math.cos(ang) * 2.2,
          vy: Math.sin(ang) * 2.2,
          angle: ang,
          spin: 0.05,
          bridged: false
        });
      }
      if (this.antibodies.length > 65) {
        this.antibodies.splice(0, this.antibodies.length - 65);
      }
    };
    this.canvas.addEventListener('click', this.onClick);
  }

  drawCell(cell, color, label) {
    const ctx = this.ctx;
    const pulse = Math.sin(this.t * 0.04 + cell.phase) * 1.5;
    const r = cell.r + pulse;

    const grad = ctx.createRadialGradient(cell.x, cell.y, r * 0.15, cell.x, cell.y, r * 1.35);
    grad.addColorStop(0, `${color}55`);
    grad.addColorStop(0.7, `${color}18`);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, r * 1.35, 0, Math.PI * 2);
    ctx.fill();

    // Membrane ring
    ctx.strokeStyle = `${color}cc`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Surface receptor spikes
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + this.t * 0.005;
      const sx = cell.x + Math.cos(a) * r;
      const sy = cell.y + Math.sin(a) * r;
      const ex = cell.x + Math.cos(a) * (r + 4.5);
      const ey = cell.y + Math.sin(a) * (r + 4.5);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // Nucleus
    ctx.fillStyle = `${color}33`;
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CHART_THEME.surface;
    ctx.font = '600 9px "Geist Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cell.x, cell.y);
  }

  drawAntibody(ab) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(ab.x, ab.y);
    ctx.rotate(ab.angle);

    // Fc stem
    ctx.strokeStyle = CHART_THEME.primary;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 7);
    ctx.stroke();

    // Fab Arm 1 (Teal)
    ctx.strokeStyle = CHART_THEME.primary;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-6, -5);
    ctx.stroke();

    // Fab Arm 2 (Amber in bispecific, Teal in monotherapy)
    ctx.strokeStyle = this.mode === 'bispecific' ? CHART_THEME.accent : CHART_THEME.primary;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(6, -5);
    ctx.stroke();

    ctx.restore();
  }

  loop() {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    this.t++;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // Subtle confocal grid
    ctx.strokeStyle = CHART_THEME.primaryFill20;
    ctx.lineWidth = 1;
    for (let x = 0; x < this.w; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.h);
      ctx.stroke();
    }
    for (let y = 0; y < this.h; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
      ctx.stroke();
    }

    // Update & draw cells
    const moveCell = (c) => {
      c.x += c.vx;
      c.y += c.vy;
      if (c.x < c.r + 8 || c.x > this.w - c.r - 8) c.vx *= -1;
      if (c.y < c.r + 8 || c.y > this.h - c.r - 8) c.vy *= -1;
    };

    this.cellsA.forEach(moveCell);
    this.cellsB.forEach(moveCell);

    // Compute bivalent bridging forces & synapses
    let activeSynapses = 0;
    const bridgeRange = this.mode === 'bispecific' ? 118 + (this.synergyScore * 0.45) : 0;

    if (this.mode === 'bispecific') {
      for (const a of this.cellsA) {
        for (const b of this.cellsB) {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);

          if (dist < bridgeRange && dist > 1) {
            activeSynapses++;
            // Gentle avidity pull toward optimal 14nm gap (~58px)
            const optimal = a.r + b.r + 16;
            if (dist > optimal) {
              const pull = 0.004 * (this.doseLevel / 60);
              a.vx += (dx / dist) * pull;
              a.vy += (dy / dist) * pull;
              b.vx -= (dx / dist) * pull;
              b.vy -= (dy / dist) * pull;
            }

            // Clamp velocity
            a.vx = Math.max(-0.55, Math.min(0.55, a.vx));
            a.vy = Math.max(-0.55, Math.min(0.55, a.vy));
            b.vx = Math.max(-0.55, Math.min(0.55, b.vx));
            b.vy = Math.max(-0.55, Math.min(0.55, b.vy));

            // Glowing energy synapse arc
            const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            grad.addColorStop(0, CHART_THEME.primary);
            grad.addColorStop(1, CHART_THEME.accent);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 2.0;
            ctx.setLineDash([4, 4]);
            ctx.lineDashOffset = -this.t * 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Midpoint docked bispecific glow
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            ctx.fillStyle = CHART_THEME.tint;
            ctx.beginPath();
            ctx.arc(mx, my, 8 + Math.sin(this.t * 0.12) * 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = CHART_THEME.surface;
            ctx.beginPath();
            ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    this.synapseCount = activeSynapses;

    // Draw antibodies
    for (const ab of this.antibodies) {
      ab.x += ab.vx;
      ab.y += ab.vy;
      ab.angle += ab.spin;
      if (ab.x < 6 || ab.x > this.w - 6) ab.vx *= -1;
      if (ab.y < 6 || ab.y > this.h - 6) ab.vy *= -1;
      this.drawAntibody(ab);
    }

    // Draw cells on top
    this.cellsA.forEach((c) => this.drawCell(c, CHART_THEME.primary, this.symA));
    this.cellsB.forEach((c) => this.drawCell(c, CHART_THEME.accent, this.symB));

    // Draw click injection pulses
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.r += 2.2;
      p.alpha -= 0.03;
      if (p.alpha <= 0) {
        this.pulses.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = `${CHART_THEME.primary}`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Live Telemetry Overlay inside canvas
    ctx.fillStyle = CHART_THEME.ink;
    ctx.fillRect(10, 10, 218, 24);
    ctx.strokeStyle = CHART_THEME.tint;
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, 218, 24);

    ctx.fillStyle = this.mode === 'bispecific' ? CHART_THEME.primary : CHART_THEME.accentInk;
    ctx.font = '600 10px "Geist Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const statusTxt = this.mode === 'bispecific'
      ? `ACTIVE SYNAPSES: ${activeSynapses} • BIVALENT LOCK`
      : `ACTIVE SYNAPSES: 0 • MONOTHERAPY LIMIT`;
    ctx.fillText(statusTxt, 18, 22);
  }

  dispose() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.onClick) this.canvas.removeEventListener('click', this.onClick);
  }
}

/**
 * Interactive 10x10 Symmetric Synergy Heatmap Matrix for Command Center
 */
export function renderSynergyHeatmap(container, onPairClick) {
  if (!container) return;

  const topGenes = ['EGFR', 'MET', 'CLDN18', 'CD3E', 'MS4A1', 'PDCD1', 'CTLA4', 'CD274', 'TNFRSF9', 'ERBB2']
    .filter((g) => TARGETS_BY_SYMBOL[g]);

  const cellColor = (score, isDiag) => {
    if (isDiag) return CHART_THEME.primaryFill20;
    if (score >= 90) return CHART_THEME.primary;
    if (score >= 82) return CHART_THEME.primary;
    if (score >= 74) return CHART_THEME.tint;
    if (score >= 66) return CHART_THEME.accentFill30;
    return CHART_THEME.accentFill30;
  };

  let gridHtml = `<div class="hm-grid" style="grid-template-columns: 62px repeat(${topGenes.length}, 1fr);">`;
  // Header row
  gridHtml += `<div class="hm-corner">f(A,B)</div>`;
  topGenes.forEach((g) => {
    gridHtml += `<div class="hm-col-lbl">${g}</div>`;
  });

  // Matrix rows
  topGenes.forEach((gA, i) => {
    gridHtml += `<div class="hm-row-lbl">${gA}</div>`;
    topGenes.forEach((gB, j) => {
      const isDiag = i === j;
      const ev = evaluatePairwiseSynergy(gA, gB, 'NSCLC');
      const bg = cellColor(ev.score, isDiag);
      gridHtml += `
        <button
          type="button"
          class="hm-cell ${isDiag ? 'hm-diag' : ''}"
          data-i="${i}"
          data-j="${j}"
          data-a="${gA}"
          data-b="${gB}"
          data-score="${ev.scoreFormatted}"
          data-mech="${ev.mechanismType || 'Homobivalent'}"
          style="background: ${bg};"
          title="${gA} × ${gB}: ${ev.scoreFormatted}"
        >
          <span>${isDiag ? '—' : Math.round(ev.score)}</span>
        </button>
      `;
    });
  });
  gridHtml += `</div>`;

  container.innerHTML = `
    ${gridHtml}
    <div id="hmHoverReadout" class="hm-readout">
      Hover any matrix cell to verify symmetric mirroring <strong>f(A, B) &equiv; f(B, A)</strong> &bull; Click any pair to launch live simulation.
    </div>
  `;

  const readout = container.querySelector('#hmHoverReadout');
  const cells = container.querySelectorAll('.hm-cell');

  cells.forEach((cell) => {
    cell.addEventListener('mouseenter', () => {
      const i = cell.dataset.i;
      const j = cell.dataset.j;
      const a = cell.dataset.a;
      const b = cell.dataset.b;
      const score = cell.dataset.score;
      const mech = cell.dataset.mech;

      // Highlight both (i,j) and mirrored (j,i) to prove permutation invariance!
      cells.forEach((c) => c.classList.remove('hm-mirror-hl'));
      cell.classList.add('hm-mirror-hl');
      const mirror = container.querySelector(`.hm-cell[data-i="${j}"][data-j="${i}"]`);
      if (mirror) mirror.classList.add('hm-mirror-hl');

      if (readout) {
        readout.innerHTML = i === j
          ? `<strong>${a} &times; ${b}</strong> &bull; Homobivalent self-pair (baseline monotherapy limit)`
          : `<span style="color: var(--wb-accent); font-weight: 600;">${a} &times; ${b} &equiv; ${b} &times; ${a}</span> &bull; Synergy: <strong>${score}</strong> &bull; ${mech} &bull; <em>Click to Screen &rarr;</em>`;
      }
    });

    cell.addEventListener('click', () => {
      if (cell.dataset.i !== cell.dataset.j && onPairClick) {
        onPairClick(cell.dataset.a, cell.dataset.b);
      }
    });
  });
}

/**
 * Interactive 4PL Dose-Response & Therapeutic Window Curve SVG Generator
 */
export function buildDoseResponseSvg(kdArmA = 18, kdArmB = 12, selectivity = 120) {
  const w = 440;
  const h = 180;
  const padL = 38;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const pw = w - padL - padR;
  const ph = h - padT - padB;

  // Log10 concentration from -2 (0.01 nM) to +3 (1000 nM)
  const ec50Tumor = Math.log10(Math.max(0.05, (kdArmA * kdArmB) / 400));
  const ec50Normal = ec50Tumor + Math.log10(Math.max(5, selectivity));

  const hill = (logC, logEC50, n = 1.6) => 1 / (1 + Math.pow(10, (logEC50 - logC) * n));

  let tumorPath = '';
  let normalPath = '';
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const logC = -2 + t * 5;
    const yT = hill(logC, ec50Tumor, 1.7);
    const yN = hill(logC, ec50Normal, 1.35);

    const px = padL + t * pw;
    const pyT = padT + (1 - yT) * ph;
    const pyN = padT + (1 - yN) * ph;

    tumorPath += i === 0 ? `M ${px.toFixed(1)} ${pyT.toFixed(1)}` : ` L ${px.toFixed(1)} ${pyT.toFixed(1)}`;
    normalPath += i === 0 ? `M ${px.toFixed(1)} ${pyN.toFixed(1)}` : ` L ${px.toFixed(1)} ${pyN.toFixed(1)}`;
  }

  // Therapeutic window shaded band between EC50 tumor and EC50 normal
  const xT = padL + Math.max(0, Math.min(1, (ec50Tumor + 2) / 5)) * pw;
  const xN = padL + Math.max(0, Math.min(1, (ec50Normal + 2) / 5)) * pw;

  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block; background: var(--surface); border-radius: 10px; border: 1px solid var(--primary-soft);">
      <!-- Therapeutic Window Shaded Zone -->
      <rect x="${Math.min(xT, xN).toFixed(1)}" y="${padT}" width="${Math.max(4, Math.abs(xN - xT)).toFixed(1)}" height="${ph}" fill="var(--primary-soft)" />
      <!-- Grid -->
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--primary-soft)" />
      <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="var(--primary-soft)" />
      <line x1="${padL}" y1="${padT + ph * 0.5}" x2="${w - padR}" y2="${padT + ph * 0.5}" stroke="var(--primary-soft)" stroke-dasharray="3 3" />

      <!-- Curves -->
      <path d="${tumorPath}" fill="none" stroke="var(--primary)" stroke-width="2.6" stroke-linecap="round" />
      <path d="${normalPath}" fill="none" stroke="var(--danger)" stroke-width="2.2" stroke-dasharray="5 3" stroke-linecap="round" />

      <!-- Legend -->
      <circle cx="${padL + 12}" cy="${padT + 10}" r="3.5" fill="var(--primary)" />
      <text x="${padL + 20}" y="${padT + 13}" fill="var(--ink)" font-family="var(--font-mono)" font-size="9">Tumor Cytolysis (Dual-Pos)</text>
      <circle cx="${padL + 175}" cy="${padT + 10}" r="3.5" fill="var(--danger)" />
      <text x="${padL + 183}" y="${padT + 13}" fill="var(--accent)" font-family="var(--font-mono)" font-size="9">Healthy Tissue Tox (Single-Pos)</text>

      <!-- Axis labels -->
      <text x="${w / 2}" y="${h - 8}" text-anchor="middle" fill="var(--primary)" font-family="var(--font-mono)" font-size="9">Antibody Concentration (0.01 nM → 1000 nM)</text>
      <text x="12" y="${h / 2}" text-anchor="middle" fill="var(--primary)" font-family="var(--font-mono)" font-size="9" transform="rotate(-90 12 ${h / 2})">Response %</text>
    </svg>
  `;
}
