/**
 * BiSpec Hero Loader
 * Renders an SVG ring with honest progress feedback for dot generation.
 */
export class HeroLoader {
  constructor(container) {
    this.container = container;
    this.totalDots = 40000;
    this.currentDots = 0;
    this.targetPercent = 0;
    this.currentPercent = 0;
    this.radius = 48;
    this.circumference = 2 * Math.PI * this.radius;

    this.element = document.createElement('div');
    this.element.className = 'hero-loader';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-label', 'Generating 40,000 antibody dots');

    this.element.innerHTML = `
      <div class="loader-inner">
        <svg class="loader-svg" width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
          <circle
            class="loader-ring-bg"
            cx="60"
            cy="60"
            r="${this.radius}"
            fill="none"
            stroke="var(--primary-soft)"
            stroke-width="2"
          />
          <circle
            class="loader-ring-progress"
            cx="60"
            cy="60"
            r="${this.radius}"
            fill="none"
            stroke="var(--color-a)"
            stroke-width="2"
            stroke-dasharray="${this.circumference}"
            stroke-dashoffset="${this.circumference}"
            stroke-linecap="round"
          />
        </svg>
        <div class="loader-stats">
          <div class="loader-number">0</div>
          <div class="loader-label">40,000 dots</div>
        </div>
      </div>
    `;

    this.container.appendChild(this.element);

    this.ringProgress = this.element.querySelector('.loader-ring-progress');
    this.numberEl = this.element.querySelector('.loader-number');
  }

  /**
   * Update honest progress
   * @param {number} current Current dots generated
   * @param {number} total Total dots required
   */
  updateProgress(current, total) {
    this.currentDots = current;
    this.totalDots = total;
    const pct = Math.min(1, current / total);
    this.targetPercent = pct;

    const offset = this.circumference - pct * this.circumference;
    if (this.ringProgress) {
      this.ringProgress.style.strokeDashoffset = offset.toFixed(2);
    }
    if (this.numberEl) {
      this.numberEl.textContent = current.toLocaleString('en-US');
    }
  }

  /**
   * Complete and fade out
   */
  finish() {
    this.updateProgress(this.totalDots, this.totalDots);
    setTimeout(() => {
      if (this.element) {
        this.element.classList.add('loader-fade-out');
        setTimeout(() => {
          if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
          }
        }, 600);
      }
    }, 200);
  }

  /**
   * Immediately remove for reduced-motion
   */
  removeImmediate() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
