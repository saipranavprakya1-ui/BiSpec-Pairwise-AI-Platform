/**
 * antibodyBlueprint.js
 * Interactive Bispecific Antibody Y-Blueprint Configurator for the Command Center.
 * Lets biologists configure Fab Arm 1 (Target A), Fab Arm 2 (Target B), and Scaffold Format
 * (1+1 CrossMab, 2+1 High-Avidity TCB, BiTE Tandem scFv, Fc-Silenced IgG1 LALAPG),
 * dynamically updating the SVG antibody geometry, biophysical parameters, and live
 * Python Clinical Safe Ensemble compatibility score.
 */

import { TARGETS_CATALOG, TARGETS_BY_SYMBOL } from '../data/biologicalDatabase.js';

const FORMATS = {
  crossmab: {
    id: 'crossmab',
    name: '1+1 CrossMab (IgG1)',
    short: '1+1 CrossMab',
    mw: '150 kDa',
    halfLife: '14–21 days',
    penetration: 'Moderate',
    crsRisk: 'Low–Moderate',
    note: 'Knobs-into-Holes heterodimeric IgG1 with CH1–CL domain crossover preventing light-chain mispairing.'
  },
  tcb21: {
    id: 'tcb21',
    name: '2+1 High-Avidity TCB',
    short: '2+1 TCB',
    mw: '200 kDa',
    halfLife: '12–16 days',
    penetration: 'Surface-Selective',
    crsRisk: 'Low (Avidity-Gated)',
    note: 'Bivalent low-affinity Arm 1 anchors selectively on high-density tumor cells while sparing healthy single-positive tissues.'
  },
  bite: {
    id: 'bite',
    name: 'BiTE (Tandem scFv)',
    short: 'BiTE scFv',
    mw: '55 kDa',
    halfLife: '2–4 hours',
    penetration: 'Deep Solid Tumor',
    crsRisk: 'Monitor (Step-Dose)',
    note: 'Compact Fc-free tandem single-chain variable fragments achieving rapid solid-tumor interstitial diffusion and tight 14 nm synapse.'
  },
  lalapg: {
    id: 'lalapg',
    name: 'Fc-Silenced IgG1 (LALAPG)',
    short: 'Fc-Silenced',
    mw: '148 kDa',
    halfLife: '18–21 days',
    penetration: 'Moderate',
    crsRisk: 'Minimal (Fc-Null)',
    note: 'L234A/L235A/P329G Fc mutations abolish FcγR & C1q binding, preventing non-specific cytokine release while preserving FcRn recycling.'
  }
};

function buildAntibodySvg(symA, symB, fmtId) {
  const isBite = fmtId === 'bite';
  const is21 = fmtId === 'tcb21';
  const isFcNull = fmtId === 'lalapg';

  if (isBite) {
    // Compact Fc-free Tandem scFv BiTE geometry
    return `
      <svg viewBox="0 0 460 280" width="100%" height="280" style="display:block;">
        <defs>
          <radialGradient id="bpGlowA" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="bpGlowB" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="145" cy="140" r="72" fill="url(#bpGlowA)" />
        <circle cx="315" cy="140" r="72" fill="url(#bpGlowB)" />

        <!-- Flexible (G4S)3 Linker -->
        <path d="M 190 140 C 212 118, 248 162, 270 140" fill="none" stroke="var(--primary)" stroke-width="3.5" stroke-dasharray="5 3" stroke-linecap="round"/>
        <text x="230" y="176" text-anchor="middle" fill="var(--primary)" font-family="var(--font-mono)" font-size="9.5">(G4S)3 Flexible Linker &bull; 55 kDa</text>

        <!-- scFv Arm A (VL + VH) -->
        <rect x="92" y="108" width="46" height="64" rx="14" fill="var(--primary-soft)" stroke="var(--primary)" stroke-width="2.2"/>
        <rect x="144" y="108" width="46" height="64" rx="14" fill="var(--tint)" stroke="var(--primary)" stroke-width="2.2"/>
        <text x="115" y="144" text-anchor="middle" fill="var(--surface)" font-family="var(--font-mono)" font-size="10" font-weight="600">VL</text>
        <text x="167" y="144" text-anchor="middle" fill="var(--surface)" font-family="var(--font-mono)" font-size="10" font-weight="600">VH</text>

        <!-- scFv Arm B (VH + VL) -->
        <rect x="270" y="108" width="46" height="64" rx="14" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2.2"/>
        <rect x="322" y="108" width="46" height="64" rx="14" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2.2"/>
        <text x="293" y="144" text-anchor="middle" fill="var(--surface)" font-family="var(--font-mono)" font-size="10" font-weight="600">VH</text>
        <text x="345" y="144" text-anchor="middle" fill="var(--surface)" font-family="var(--font-mono)" font-size="10" font-weight="600">VL</text>

        <!-- Target Labels -->
        <rect x="78" y="42" width="124" height="32" rx="8" fill="var(--primary-soft)" stroke="var(--primary)" stroke-width="1"/>
        <text x="140" y="62" text-anchor="middle" fill="var(--primary)" font-family="var(--font-mono)" font-size="12" font-weight="700">ARM 1: ${symA}</text>
        <line x1="140" y1="74" x2="140" y2="104" stroke="var(--primary)" stroke-width="1.2" stroke-dasharray="3 3"/>

        <rect x="258" y="42" width="124" height="32" rx="8" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1"/>
        <text x="320" y="62" text-anchor="middle" fill="var(--accent)" font-family="var(--font-mono)" font-size="12" font-weight="700">ARM 2: ${symB}</text>
        <line x1="320" y1="74" x2="320" y2="104" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="3 3"/>

        <text x="230" y="246" text-anchor="middle" fill="var(--primary)" font-family="var(--font-mono)" font-size="9.5">NO Fc DOMAIN &bull; DIRECT 14 nm CYTOLYTIC SYNAPSE</text>
      </svg>
    `;
  }

  // IgG-like Y-Antibody Geometry (CrossMab 1+1, 2+1 TCB, Fc-Silenced LALAPG)
  return `
    <svg viewBox="0 0 460 280" width="100%" height="280" style="display:block;">
      <defs>
        <radialGradient id="bpGlowA" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.24"/>
          <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="bpGlowB" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.24"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <circle cx="152" cy="96" r="64" fill="url(#bpGlowA)" />
      <circle cx="308" cy="96" r="64" fill="url(#bpGlowB)" />

      <!-- Fc Stem (CH2 + CH3 Heavy Chains — Knobs-into-Holes) -->
      <rect x="206" y="156" width="20" height="84" rx="8" fill="${isFcNull ? 'var(--primary-soft)' : 'var(--primary-soft)'}" stroke="${isFcNull ? 'var(--primary)' : 'var(--primary)'}" stroke-width="2"/>
      <rect x="234" y="156" width="20" height="84" rx="8" fill="${isFcNull ? 'var(--primary-soft)' : 'var(--accent-soft)'}" stroke="${isFcNull ? 'var(--primary)' : 'var(--accent)'}" stroke-width="2"/>
      <!-- Disulfide Hinge Bonds -->
      <line x1="226" y1="168" x2="234" y2="168" stroke="var(--ink)" stroke-width="2"/>
      <line x1="226" y1="176" x2="234" y2="176" stroke="var(--ink)" stroke-width="2"/>
      <!-- Knob-into-Hole marker -->
      <circle cx="230" cy="216" r="5" fill="var(--ink)" stroke="var(--primary)" stroke-width="1.6"/>
      <text x="230" y="258" text-anchor="middle" fill="var(--primary)" font-family="var(--font-mono)" font-size="9">
        ${isFcNull ? 'Fc-SILENCED (LALAPG) • ZERO FcγR BINDING' : 'KNOBS-INTO-HOLES IgG1 Fc • FcRn RECYCLING'}
      </text>

      <!-- Left Fab Arm (Arm 1 — Tumor Anchor) -->
      <g transform="translate(214, 152) rotate(-38)">
        <rect x="-12" y="-82" width="18" height="78" rx="7" fill="var(--tint)" stroke="var(--primary)" stroke-width="2"/>
        <rect x="-34" y="-82" width="16" height="68" rx="7" fill="var(--primary-soft)" stroke="var(--primary)" stroke-width="1.8"/>
      </g>

      ${is21 ? `
        <!-- Extra Tandem Fab Arm 1 (2+1 High-Avidity TCB) -->
        <g transform="translate(154, 88) rotate(-62)">
          <rect x="-10" y="-58" width="16" height="54" rx="6" fill="var(--tint)" stroke="var(--primary)" stroke-width="2"/>
          <rect x="-30" y="-58" width="14" height="48" rx="6" fill="var(--primary-soft)" stroke="var(--primary)" stroke-width="1.6"/>
        </g>
      ` : ''}

      <!-- Right Fab Arm (Arm 2 — Effector / Co-Target) -->
      <g transform="translate(246, 152) rotate(38)">
        <rect x="-6" y="-82" width="18" height="78" rx="7" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/>
        <rect x="18" y="-82" width="16" height="68" rx="7" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.8"/>
      </g>

      <!-- Arm 1 Badge -->
      <rect x="24" y="22" width="148" height="34" rx="8" fill="var(--primary-soft)" stroke="var(--primary)" stroke-width="1"/>
      <text x="98" y="43" text-anchor="middle" fill="var(--primary)" font-family="var(--font-mono)" font-size="11.5" font-weight="700">${is21 ? '2× ' : 'FAB 1: '}${symA}</text>
      <line x1="126" y1="56" x2="152" y2="82" stroke="var(--primary)" stroke-width="1.2" stroke-dasharray="3 3"/>

      <!-- Arm 2 Badge -->
      <rect x="288" y="22" width="148" height="34" rx="8" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1"/>
      <text x="362" y="43" text-anchor="middle" fill="var(--accent)" font-family="var(--font-mono)" font-size="11.5" font-weight="700">FAB 2: ${symB}</text>
      <line x1="334" y1="56" x2="308" y2="82" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="3 3"/>
    </svg>
  `;
}

export function mountAntibodyBlueprint(container, { onScreenPair } = {}) {
  if (!container) return;

  const featured = ['EGFR', 'MET', 'CLDN18', 'CD3E', 'MS4A1', 'PDCD1', 'CTLA4', 'CD274', 'TNFRSF9', 'ERBB2', 'TACSTD2', 'MSLN', 'LAG3', 'TIGIT', 'VEGFA', 'CD47', 'BCMA'];
  const allSyms = [
    ...featured.filter((g) => TARGETS_BY_SYMBOL[g]),
    ...TARGETS_CATALOG.map((t) => t.symbol).filter((s) => !featured.includes(s)).sort()
  ];
  const opts = (sel) => allSyms.map((s) => `<option value="${s}" ${s === sel ? 'selected' : ''}>${s}</option>`).join('');

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 18px; align-items: stretch;" class="umap-layout-grid">
      <!-- Left: Interactive Y-Antibody Structural Blueprint -->
      <div style="background: var(--surface); border: 1px solid var(--wb-border); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px;">
          <span id="bpFormatTitle" style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--wb-accent); font-weight: 600;">1+1 CrossMab (IgG1)</span>
          <span id="bpLiveScorePill" style="font-family: var(--font-mono); font-size: 0.74rem; padding: 3px 9px; border-radius: 6px; background: var(--primary-soft); border: 1px solid var(--tint); color: var(--wb-accent);">
            Scoring...
          </span>
        </div>
        <div id="bpSvgStage"></div>
        <div id="bpFormatNote" style="font-size: 0.75rem; color: var(--color-muted); line-height: 1.45; border-top: 1px solid var(--primary-soft); padding-top: 10px; margin-top: 4px;"></div>
      </div>

      <!-- Right: Arm & Scaffold Engineering Controls -->
      <div style="background: var(--surface); border: 1px solid var(--wb-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 14px;">
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label for="bpSelectA" style="display:block; font-family: var(--font-mono); font-size: 0.66rem; color: var(--wb-accent); margin-bottom: 5px; text-transform: uppercase;">Fab Arm 1 (Tumor Anchor)</label>
              <select id="bpSelectA" class="form-select" style="width: 100%; padding: 7px 10px; font-size: 0.82rem;">${opts('EGFR')}</select>
            </div>
            <div>
              <label for="bpSelectB" style="display:block; font-family: var(--font-mono); font-size: 0.66rem; color: var(--wb-amber); margin-bottom: 5px; text-transform: uppercase;">Fab Arm 2 (Effector)</label>
              <select id="bpSelectB" class="form-select" style="width: 100%; padding: 7px 10px; font-size: 0.82rem;">${opts('MET')}</select>
            </div>
          </div>

          <div>
            <span style="display:block; font-family: var(--font-mono); font-size: 0.66rem; color: var(--color-muted); margin-bottom: 6px; text-transform: uppercase;">Antibody Scaffold Architecture</span>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
              ${Object.values(FORMATS).map((f, idx) => `
                <button type="button" class="wb-preset-chip js-bp-format ${idx === 0 ? 'active' : ''}" data-fmt="${f.id}" style="justify-content: center; padding: 7px 8px; font-size: 0.72rem;">
                  ${f.short}
                </button>
              `).join('')}
            </div>
          </div>

          <div id="bpSpecGrid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;"></div>
        </div>

        <button type="button" id="btnBpLaunchStudio" class="wb-btn-primary" style="width: 100%; justify-content: center; padding: 11px;">
          <span>Screen This Blueprint in Studio &rarr;</span>
        </button>
      </div>
    </div>
  `;

  const svgStage = container.querySelector('#bpSvgStage');
  const selA = container.querySelector('#bpSelectA');
  const selB = container.querySelector('#bpSelectB');
  const fmtBtns = container.querySelectorAll('.js-bp-format');
  const fmtTitle = container.querySelector('#bpFormatTitle');
  const fmtNote = container.querySelector('#bpFormatNote');
  const specGrid = container.querySelector('#bpSpecGrid');
  const scorePill = container.querySelector('#bpLiveScorePill');
  const btnLaunch = container.querySelector('#btnBpLaunchStudio');

  let activeFmt = 'crossmab';

  const fetchScore = async (a, b) => {
    if (!scorePill) return;
    if (a === b) { scorePill.textContent = 'Select 2 Distinct'; return; }
    scorePill.textContent = 'Scoring...';
    try {
      const r = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_a: a, target_b: b, indication: 'Non-Small Cell Lung Cancer', model_name: 'Clinical Safe Ensemble' })
      });
      if (r.ok) {
        const d = await r.json();
        const cons = d.clinical_consensus ? ` • ${d.clinical_consensus.agree_count}/${d.clinical_consensus.total_models} Quorum` : '';
        scorePill.textContent = `Ensemble: ${Number(d.compatibility_percentage).toFixed(1)}%${cons}`;
      } else {
        scorePill.textContent = 'Live Ensemble Ready';
      }
    } catch (_) {
      scorePill.textContent = 'Live Ensemble Ready';
    }
  };

  const render = () => {
    const a = selA.value;
    const b = selB.value;
    const fmt = FORMATS[activeFmt] || FORMATS.crossmab;

    if (fmtTitle) fmtTitle.textContent = fmt.name;
    if (fmtNote) fmtNote.textContent = fmt.note;
    if (svgStage) svgStage.innerHTML = buildAntibodySvg(a, b, activeFmt);

    if (specGrid) {
      const items = [
        { k: 'Molecular Weight', v: fmt.mw, c: 'var(--ink)' },
        { k: 'Serum Half-Life', v: fmt.halfLife, c: 'var(--wb-accent)' },
        { k: 'Tumor Penetration', v: fmt.penetration, c: 'var(--wb-sky)' },
        { k: 'CRS Safety Profile', v: fmt.crsRisk, c: 'var(--wb-amber)' }
      ];
      specGrid.innerHTML = items.map((it) => `
        <div style="padding: 9px 10px; border-radius: 8px; background: var(--border); border: 1px solid var(--wb-border);">
          <div style="font-family: var(--font-mono); font-size: 0.62rem; color: var(--color-muted); text-transform: uppercase;">${it.k}</div>
          <div style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 600; color: ${it.c}; margin-top: 3px;">${it.v}</div>
        </div>
      `).join('');
    }

    fmtBtns.forEach((btn) => {
      const act = btn.dataset.fmt === activeFmt;
      btn.classList.toggle('active', act);
      btn.style.background = act ? 'var(--primary-soft)' : '';
      btn.style.borderColor = act ? 'var(--tint)' : '';
      btn.style.color = act ? 'var(--wb-accent)' : '';
    });

    fetchScore(a, b);
  };

  selA.addEventListener('change', render);
  selB.addEventListener('change', render);
  fmtBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFmt = btn.dataset.fmt;
      render();
    });
  });

  if (btnLaunch) {
    btnLaunch.addEventListener('click', () => {
      if (selA.value !== selB.value && onScreenPair) {
        onScreenPair(selA.value, selB.value);
      }
    });
  }

  render();
}
