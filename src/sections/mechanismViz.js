/**
 * src/sections/mechanismViz.js
 * BiSpec Interactive 3D Video Mechanism & Kinetic Synchronization Component
 * Intelligently uses the uploaded 3D bispecific antibody & dual-cell docking video
 * (bispec_hero.mp4) with interactive 4-stage timestamp scrubbing, live biophysics
 * telemetry readouts, and an interactive dual-target overlay HUD.
 */

export class MechanismViz {
  constructor(container) {
    this.container = container;
    this.currentStep = 1;
    this.totalSteps = 4;
    this.isPlayingAll = false;

    this.mediaQueryReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.isReducedMotion = this.mediaQueryReducedMotion.matches;

    // 4 Biophysical Stages mapped directly to the uploaded 3D video timeline (0.0s -> 8.0s)
    this.stepData = [
      {
        step: 1,
        timeStart: 0.0,
        timeTarget: 0.65,
        timeEnd: 1.5,
        label: 'Stage 01 &bull; Asymmetric 1+1 Bispecific Conformation',
        caption: 'Free-floating Y-shaped bispecific IgG molecule featuring Fab Arm 1 (Teal, Target A tumor anchor) and Fab Arm 2 (Amber, Target B effector/RTK domain) amidst single-cell AI feature vectors.',
        kdReadout: '18.4 nM (Monovalent)',
        residenceHalfLife: '4.2 min',
        selectivityWindow: 'Baseline (Unbound)',
        synapseState: 'Diffusing in Tumor Interstitium',
        badgeLeft: 'Target A Cell (Approaching)',
        badgeCenter: 'Asymmetric 1+1 Bispecific IgG',
        badgeRight: 'Target B Cell (Approaching)'
      },
      {
        step: 2,
        timeStart: 1.5,
        timeTarget: 2.35,
        timeEnd: 3.1,
        label: 'Stage 02 &bull; Stoichiometric Cellular Orientation',
        caption: 'Upon encountering Target A on the left cell surface and Target B on the right cell membrane, the hinge region rotates 90° into a horizontal trans-bridging axis.',
        kdReadout: '2.1 nM (Initial Encounter)',
        residenceHalfLife: '19.5 min',
        selectivityWindow: '8.8× Tumor Bias',
        synapseState: 'Axial Rotation & Dipole Alignment',
        badgeLeft: 'Fab Arm 1 → Target A Alignment',
        badgeCenter: 'Hinge Torsional Alignment',
        badgeRight: 'Fab Arm 2 → Target B Alignment'
      },
      {
        step: 3,
        timeStart: 3.1,
        timeTarget: 4.3,
        timeEnd: 5.3,
        label: 'Stage 03 &bull; Coincident Bivalent Avidity Lock',
        caption: 'Simultaneous docking of both Fab arms onto Target A and Target B mechanically locks the two cells into an obligate inter-membrane gap (~14 nm), multiplying binding avidity by >100-fold.',
        kdReadout: '14.2 pM (Bivalent Avidity)',
        residenceHalfLife: '> 6.4 hrs',
        selectivityWindow: '142× Over Healthy Tissue',
        synapseState: 'Obligate Dual-Antigen Lock Established',
        badgeLeft: 'Target A Engaged (Teal Epitope)',
        badgeCenter: '14 nm Immunological Bridge',
        badgeRight: 'Target B Engaged (Amber Epitope)'
      },
      {
        step: 4,
        timeStart: 5.3,
        timeTarget: 6.8,
        timeEnd: 7.95,
        label: 'Stage 04 &bull; Immunological Synapse &amp; Signal Transduction',
        caption: 'Active bidirectional energy and signaling streams propagate across the bispecific bridge, driving receptor clustering, bypass blockade, and directed cytolytic synapse activation.',
        kdReadout: '11.8 pM (Cooperativity Peak)',
        residenceHalfLife: '> 12.0 hrs (Internalized)',
        selectivityWindow: '210× Coincidence Gated',
        synapseState: 'Active Cytolytic / Dual-Blockade Flux',
        badgeLeft: 'Effector / Receptor Flux Active',
        badgeCenter: 'Bidirectional Synapse Stream',
        badgeRight: 'Tumor Lysis & Pathway Shutdown'
      }
    ];

    this.render();
    this.bindEvents();
    this.setStep(3, false); // Default to Stage 03 (Bivalent Bridging showcase) on initial render
  }

  render() {
    this.container.innerHTML = `
      <div class="mechanism-interactive-card" role="region" aria-label="Interactive 3D Bispecific Mechanism of Action" tabindex="0">
        <!-- Top Navigation & Stepper Bar -->
        <div class="mech-header-bar">
          <div class="mech-step-tabs" role="tablist">
            <button class="mech-tab-btn" data-step="1" role="tab" aria-selected="false">
              <span class="mech-tab-num">01</span>
              <span class="mech-tab-text">Dual-Fab Conformation</span>
            </button>
            <button class="mech-tab-btn" data-step="2" role="tab" aria-selected="false">
              <span class="mech-tab-num">02</span>
              <span class="mech-tab-text">Axial Alignment</span>
            </button>
            <button class="mech-tab-btn active" data-step="3" role="tab" aria-selected="true">
              <span class="mech-tab-num">03</span>
              <span class="mech-tab-text">Bivalent Avidity Lock</span>
            </button>
            <button class="mech-tab-btn" data-step="4" role="tab" aria-selected="false">
              <span class="mech-tab-num">04</span>
              <span class="mech-tab-text">Synapse &amp; Signal Flux</span>
            </button>
          </div>

          <div class="mech-controls">
            <button class="mech-ctrl-btn prev-btn" aria-label="Previous mechanism step" title="Previous Step (Left Arrow)">
              <span aria-hidden="true">&larr;</span>
            </button>
            <button class="mech-ctrl-btn next-btn" aria-label="Next mechanism step" title="Next Step (Right Arrow)">
              <span aria-hidden="true">&rarr;</span>
            </button>
            <button class="mech-replay-btn" id="mechPlayAllBtn" aria-label="Play full 3D mechanism sequence" title="Play Full 3D Sequence">
              <span aria-hidden="true">&#9654;</span> Play 3D Sequence
            </button>
          </div>
        </div>

        <!-- High-Definition 3D Video Interactive Viewport -->
        <div class="mech-video-viewport">
          <video
            id="mech-stage-video"
            class="mech-stage-video"
            src="/assets/bispec_hero.mp4"
            muted
            playsinline
            preload="auto"
          ></video>

          <!-- Subtle edge vignette & bottom-right watermark shield -->
          <div class="mech-video-scrim"></div>

          <!-- Top Live Biophysical Telemetry Overlay Bar -->
          <div class="mech-hud-overlay-top">
            <div class="mech-hud-chip">
              <span class="hud-chip-label">Apparent Affinity ($K_D$)</span>
              <span class="hud-chip-val" id="mechKdVal">14.2 pM (Bivalent Avidity)</span>
            </div>
            <div class="mech-hud-chip">
              <span class="hud-chip-label">Membrane Residence ($t_{1/2}$)</span>
              <span class="hud-chip-val" id="mechResidenceVal">&gt; 6.4 hrs</span>
            </div>
            <div class="mech-hud-chip">
              <span class="hud-chip-label">Tumor Selectivity Index</span>
              <span class="hud-chip-val" id="mechSelectivityVal" style="color: var(--color-a);">142&times; Over Healthy Tissue</span>
            </div>
            <div class="mech-hud-chip">
              <span class="hud-chip-label">Biophysical State</span>
              <span class="hud-chip-val" id="mechStateVal" style="color: var(--color-b);">Obligate Dual-Antigen Lock</span>
            </div>
          </div>

          <!-- Bottom Spatial Callout Badges Mapped to Left Cell, Center Antibody, Right Cell -->
          <div class="mech-hud-overlay-bottom">
            <div class="mech-spatial-tag tag-left">
              <span class="arm-dot arm-a"></span>
              <span id="mechBadgeLeft">Target A Engaged (Teal Epitope)</span>
            </div>
            <div class="mech-spatial-tag tag-center">
              <span class="hud-center-dot"></span>
              <span id="mechBadgeCenter">14 nm Immunological Bridge</span>
            </div>
            <div class="mech-spatial-tag tag-right">
              <span class="arm-dot arm-b"></span>
              <span id="mechBadgeRight">Target B Engaged (Amber Epitope)</span>
            </div>
          </div>

          <!-- Interactive Timeline Scrubber Bar -->
          <div class="mech-timeline-track">
            <div class="mech-timeline-fill" id="mechTimelineFill" style="width: 75%;"></div>
          </div>
        </div>

        <!-- Captions Area -->
        <div class="mech-caption-box">
          <div class="mech-caption-label" id="mech-caption-label">Stage 03 &bull; Coincident Bivalent Avidity Lock</div>
          <p class="mech-caption-text" id="mech-caption-text">
            Simultaneous docking of both Fab arms onto Target A and Target B mechanically locks the two cells into an obligate inter-membrane gap (~14 nm), multiplying binding avidity by &gt;100-fold.
          </p>
        </div>
      </div>
    `;

    this.videoEl = this.container.querySelector('#mech-stage-video');
    this.playBtn = this.container.querySelector('#mechPlayAllBtn');
    this.timelineFill = this.container.querySelector('#mechTimelineFill');
    this.targetVideoTime = 4.3;
    this.scrubRaf = null;
  }

  setStep(stepIndex, animateSegment = true) {
    if (stepIndex < 1 || stepIndex > this.totalSteps) return;
    this.currentStep = stepIndex;

    // Synchronize Hero background video as well
    if (window.__biSpecHero && window.__biSpecHero.setMechanismStep) {
      window.__biSpecHero.setMechanismStep(stepIndex);
    }

    const data = this.stepData[stepIndex - 1];

    // 1. Update Tab Buttons
    const tabBtns = this.container.querySelectorAll('.mech-tab-btn');
    tabBtns.forEach((btn) => {
      const btnStep = parseInt(btn.getAttribute('data-step'), 10);
      const isActive = btnStep === stepIndex;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // 2. Update Caption & HUD Readouts
    const labelEl = this.container.querySelector('#mech-caption-label');
    const textEl = this.container.querySelector('#mech-caption-text');
    const kdEl = this.container.querySelector('#mechKdVal');
    const resEl = this.container.querySelector('#mechResidenceVal');
    const selEl = this.container.querySelector('#mechSelectivityVal');
    const stateEl = this.container.querySelector('#mechStateVal');
    const badgeLeft = this.container.querySelector('#mechBadgeLeft');
    const badgeCenter = this.container.querySelector('#mechBadgeCenter');
    const badgeRight = this.container.querySelector('#mechBadgeRight');

    if (labelEl) labelEl.innerHTML = data.label;
    if (textEl) textEl.innerHTML = data.caption;
    if (kdEl) kdEl.textContent = data.kdReadout;
    if (resEl) resEl.textContent = data.residenceHalfLife;
    if (selEl) selEl.textContent = data.selectivityWindow;
    if (stateEl) stateEl.textContent = data.synapseState;
    if (badgeLeft) badgeLeft.textContent = data.badgeLeft;
    if (badgeCenter) badgeCenter.textContent = data.badgeCenter;
    if (badgeRight) badgeRight.textContent = data.badgeRight;

    if (this.timelineFill) {
      this.timelineFill.style.width = `${(stepIndex / this.totalSteps) * 100}%`;
    }

    // 3. Smoothly play or scrub the 3D video to this stage's exact window
    if (this.videoEl && !this.isPlayingAll) {
      if (animateSegment && !this.isReducedMotion && this.videoEl.readyState >= 2) {
        this.playStageSegment(data.timeStart, data.timeEnd);
      } else {
        this.seekVideoSmooth(data.timeTarget);
      }
    }
  }

  playStageSegment(startTime, endTime) {
    if (!this.videoEl) return;
    if (this.segmentTimer) clearInterval(this.segmentTimer);

    // If current time is far from startTime, jump to startTime of this stage
    if (Math.abs(this.videoEl.currentTime - startTime) > 1.2 || this.videoEl.currentTime >= endTime) {
      this.videoEl.currentTime = startTime;
    }

    this.videoEl.play().catch(() => {});
    this.segmentTimer = setInterval(() => {
      if (!this.videoEl || this.isPlayingAll) {
        clearInterval(this.segmentTimer);
        return;
      }
      if (this.videoEl.currentTime >= endTime) {
        this.videoEl.pause();
        clearInterval(this.segmentTimer);
      }
    }, 60);
  }

  seekVideoSmooth(targetSec) {
    if (!this.videoEl) return;
    if (this.segmentTimer) clearInterval(this.segmentTimer);
    this.videoEl.pause();
    if (this.videoEl.readyState >= 1) {
      this.videoEl.currentTime = targetSec;
    } else {
      this.videoEl.addEventListener(
        'loadedmetadata',
        () => {
          this.videoEl.currentTime = targetSec;
        },
        { once: true }
      );
    }
  }

  bindEvents() {
    // Tab Button Clicks
    const tabBtns = this.container.querySelectorAll('.mech-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.stopReplay();
        const step = parseInt(btn.getAttribute('data-step'), 10);
        this.setStep(step, true);
      });
    });

    // Prev / Next Controls
    const prevBtn = this.container.querySelector('.prev-btn');
    const nextBtn = this.container.querySelector('.next-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.stopReplay();
        const newStep = Math.max(1, this.currentStep - 1);
        this.setStep(newStep, true);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.stopReplay();
        const newStep = Math.min(this.totalSteps, this.currentStep + 1);
        this.setStep(newStep, true);
      });
    }

    // Play Full 3D Sequence Button
    if (this.playBtn) {
      this.playBtn.addEventListener('click', () => {
        if (this.isPlayingAll) {
          this.stopReplay();
        } else {
          this.startReplay();
        }
      });
    }

    // Sync active tab while full sequence plays
    if (this.videoEl) {
      this.videoEl.addEventListener('timeupdate', () => {
        if (!this.isPlayingAll) return;
        const t = this.videoEl.currentTime;
        const duration = this.videoEl.duration || 8.0;
        if (this.timelineFill) {
          this.timelineFill.style.width = `${Math.min(100, (t / duration) * 100).toFixed(1)}%`;
        }
        let activeStage = 1;
        if (t >= 5.3) activeStage = 4;
        else if (t >= 3.1) activeStage = 3;
        else if (t >= 1.5) activeStage = 2;

        if (activeStage !== this.currentStep) {
          this.setStep(activeStage, false);
        }
      });

      this.videoEl.addEventListener('ended', () => {
        if (this.isPlayingAll) {
          this.stopReplay();
        }
      });
    }

    // Keyboard Arrow Navigation
    const interactiveCard = this.container.querySelector('.mechanism-interactive-card');
    if (interactiveCard) {
      interactiveCard.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          this.stopReplay();
          this.setStep(Math.min(this.totalSteps, this.currentStep + 1), true);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          this.stopReplay();
          this.setStep(Math.max(1, this.currentStep - 1), true);
        }
      });
    }
  }

  startReplay() {
    if (this.segmentTimer) clearInterval(this.segmentTimer);
    this.isPlayingAll = true;

    if (this.playBtn) {
      this.playBtn.innerHTML = `<span aria-hidden="true">&#9208;</span> Pause Sequence`;
    }

    if (window.__biSpecHero && window.__biSpecHero.replayMechanism) {
      window.__biSpecHero.replayMechanism();
    }

    if (this.videoEl) {
      this.videoEl.currentTime = 0;
      this.setStep(1, false);
      this.videoEl.play().catch(() => {});
    }
  }

  stopReplay() {
    this.isPlayingAll = false;
    if (this.segmentTimer) clearInterval(this.segmentTimer);
    if (this.videoEl && !this.videoEl.paused) {
      this.videoEl.pause();
    }
    if (this.playBtn) {
      this.playBtn.innerHTML = `<span aria-hidden="true">&#9654;</span> Play 3D Sequence`;
    }
  }

  dispose() {
    this.stopReplay();
  }
}

export function initMechanismViz(container) {
  if (!container) return null;
  const instance = new MechanismViz(container);
  window.__mechanismViz = instance;
  return instance;
}
