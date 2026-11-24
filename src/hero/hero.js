/**
 * src/hero/hero.js
 * BiSpec Intelligent Cinematic Video Hero & Scroll-Synced 3D Mechanism Engine
 * Replaces the procedural Three.js point cloud with the authentic high-resolution
 * 3D bispecific antibody & dual-cell docking video (bispec_hero.mp4).
 */

export class HeroScene {
  constructor(container) {
    this.container = container;
    this.isDisposed = false;
    this.animationFrameId = null;

    // Motion preference
    this.mediaQueryReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.isReducedMotion = this.mediaQueryReducedMotion.matches;

    // Video & timeline states
    // Video duration ~8.0s:
    //   0.0s - 1.5s: Step 1 (Free-floating Y-shaped bispecific antibody with AI neural backdrop)
    //   1.5s - 3.2s: Step 2 (Antibody rotates & aligns horizontally between Target A & Target B cells)
    //   3.2s - 5.5s: Step 3 (Bivalent bridging — Fab Arm 1 & Fab Arm 2 dock onto both cell membranes)
    //   5.5s - 8.0s: Step 4 (Synapse induction — glowing teal & amber energy waves flow across the bridge)
    this.stepTimestamps = {
      1: 0.6,
      2: 2.3,
      3: 4.2,
      4: 6.8
    };

    this.mode = 'cinematic'; // 'cinematic' (smooth loop in top hero) | 'scrub' (scroll or step-locked)
    this.targetTime = 0.6;
    this.forcedStep = null;

    // Subtle cursor parallax
    this.mouse = { x: 0, y: 0 };
    this.targetMouse = { x: 0, y: 0 };

    this.init();
  }

  init() {
    // Clear any existing content inside #stage
    this.container.innerHTML = '';

    // 1. Build Cinematic Video Stage Wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'hero-video-stage';

    // 2. Create Primary High-Definition Video Element
    this.video = document.createElement('video');
    this.video.className = 'hero-cinema-video';
    this.video.src = '/assets/bispec_hero_daylight.mp4';
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.autoplay = !this.isReducedMotion;
    this.video.preload = 'auto';
    this.video.setAttribute('aria-hidden', 'true');

    // 3. Create Atmospheric Vignette & Readability Scrims
    // (Softens edges, masks bottom-right corner artifact, and ensures crisp typography contrast)
    this.vignette = document.createElement('div');
    this.vignette.className = 'hero-video-vignette';

    // 4. Create Interactive Cursor Spotlight Layer
    this.spotlight = document.createElement('div');
    this.spotlight.className = 'hero-video-spotlight';

    // 5. Create Live Telemetry HUD Pill in Bottom-Right of Hero
    this.telemetryHud = document.createElement('div');
    this.telemetryHud.className = 'hero-video-hud';
    this.telemetryHud.innerHTML = `
      <span class="hud-pulse-dot"></span>
      <span class="hud-phase-label" id="heroHudPhaseText">PHASE 01 &bull; DUAL-FAB CONFORMATION</span>
    `;

    this.wrapper.appendChild(this.video);
    this.wrapper.appendChild(this.vignette);
    this.wrapper.appendChild(this.spotlight);
    this.container.appendChild(this.wrapper);
    this.container.appendChild(this.telemetryHud);

    this.hudTextEl = this.telemetryHud.querySelector('#heroHudPhaseText');

    // Start playback once metadata is ready
    this.video.addEventListener('loadedmetadata', () => {
      if (!this.isReducedMotion) {
        this.video.play().catch(() => {});
      } else {
        this.video.currentTime = 4.2;
      }
    });

    this.bindEvents();
    this.animate = this.animate.bind(this);
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  bindEvents() {
    this.onMouseMove = (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      this.targetMouse.x = nx;
      this.targetMouse.y = ny;

      if (this.spotlight) {
        const px = ((e.clientX / window.innerWidth) * 100).toFixed(1);
        const py = ((e.clientY / window.innerHeight) * 100).toFixed(1);
        this.spotlight.style.background = `radial-gradient(280px circle at ${px}% ${py}%, var(--grid-dot), transparent 65%)`;
        this.spotlight.style.opacity = '0.35';
      }
    };

    this.onScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset;
      const vh = window.innerHeight || 800;

      // When user is at the top hero (scrollY < 0.35 * vh) and no mechanism step was manually forced,
      // play the full cinematic loop continuously.
      if (scrollY < vh * 0.35 && this.forcedStep === null) {
        if (this.mode !== 'cinematic') {
          this.mode = 'cinematic';
          if (!this.isReducedMotion && this.video.paused) {
            this.video.play().catch(() => {});
          }
        }
      } else if (this.forcedStep === null) {
        // Scroll-driven timeline scrubbing as user scrolls through Problem & Mechanism sections
        this.mode = 'scrub';
        if (!this.video.paused) {
          this.video.pause();
        }
        const docHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        ) - vh;
        const progress = Math.max(0, Math.min(1, (scrollY - vh * 0.25) / Math.max(1, docHeight - vh * 0.25)));
        const duration = this.video.duration || 8.0;
        this.targetTime = Math.min(duration - 0.15, Math.max(0.2, progress * duration));
      }
    };

    this.onResize = () => {};

    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
  }

  /**
   * Synchronize background 3D video with MechanismViz interactive step (1..4)
   */
  setMechanismStep(stepIndex) {
    const timestamp = this.stepTimestamps[stepIndex] || 4.2;
    this.targetTime = timestamp;

    // Only pause and scrub if user is scrolled down near Mechanism section or clicked a step
    const scrollY = window.scrollY || window.pageYOffset;
    if (scrollY > window.innerHeight * 0.3) {
      this.mode = 'scrub';
      if (this.video && !this.video.paused) {
        this.video.pause();
      }
    }
    this.updateHudByTime(timestamp);
  }

  /**
   * Replay full 8-second cinematic sequence from 0.0s
   */
  replayMechanism() {
    this.forcedStep = null;
    this.mode = 'cinematic';
    if (this.video) {
      this.video.currentTime = 0;
      this.video.play().catch(() => {});
    }
  }

  updateHudByTime(t) {
    if (!this.hudTextEl) return;
    if (t < 1.6) {
      this.hudTextEl.innerHTML = 'PHASE 01 &bull; ASYMMETRIC 1+1 BISPECIFIC ANTIBODY';
    } else if (t < 3.3) {
      this.hudTextEl.innerHTML = 'PHASE 02 &bull; STOICHIOMETRIC CELLULAR ALIGNMENT';
    } else if (t < 5.4) {
      this.hudTextEl.innerHTML = 'PHASE 03 &bull; BIVALENT AVIDITY DOCKING (TARGET A &times; B)';
    } else {
      this.hudTextEl.innerHTML = 'PHASE 04 &bull; IMMUNOLOGICAL SYNAPSE &amp; CYTOLYTIC SIGNALING';
    }
  }

  animate() {
    if (this.isDisposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);

    // Gentle mouse parallax interpolation
    this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.04;
    this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.04;

    if (this.video) {
      const tx = (-this.mouse.x * 3).toFixed(2);
      const ty = (-this.mouse.y * 2).toFixed(2);
      this.video.style.transform = `scale(1.015) translate3d(${tx}px, ${ty}px, 0)`;

      if (this.mode === 'scrub' && this.video.readyState >= 2) {
        const diff = this.targetTime - this.video.currentTime;
        if (Math.abs(diff) > 0.03) {
          this.video.currentTime += diff * 0.14;
        }
        this.updateHudByTime(this.video.currentTime);
      } else if (this.mode === 'cinematic') {
        this.updateHudByTime(this.video.currentTime || 0);
      }
    }
  }

  dispose() {
    this.isDisposed = true;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
  }
}

export function initHero(container) {
  if (!container) return null;
  const instance = new HeroScene(container);
  window.__biSpecHero = instance;
  return instance;
}
