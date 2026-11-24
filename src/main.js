import './styles/tokens.css';
import './styles/reset.css';
import './styles/sections.css';
import './styles/appWorkspace.css';
import './styles/workbench.css';
import './styles/resultsAndPipeline.css';
import './styles/daylightTheme.css';
import { initHero } from './hero/hero.js';
import { initMechanismViz } from './sections/mechanismViz.js';
import { initAppWorkspace } from './sections/appWorkspace.js';
import { initResultsSection } from './sections/resultsComponent.js';
import { initPipelineSection } from './sections/pipelineComponent.js';

// 1. Initialize Three.js WebGL Point-Cloud Hero
const heroStage = document.getElementById('stage');
if (heroStage) {
  initHero(heroStage);
}

// 2. Initialize Interactive Scroll-Driven Mechanism Visualization (#mechanism-viz)
const mechanismVizRoot = document.getElementById('mechanism-viz');
if (mechanismVizRoot) {
  initMechanismViz(mechanismVizRoot);
}

// 3. Initialize Data-Driven Results Section
const resultsRoot = document.getElementById('results-mount');
if (resultsRoot) {
  initResultsSection(resultsRoot);
}

// 4. Initialize Data-Driven Pipeline Section
const pipelineRoot = document.getElementById('pipeline-mount');
if (pipelineRoot) {
  initPipelineSection(pipelineRoot);
}

// 5. Initialize Multi-View Application Workspace & Login Portal
initAppWorkspace();

// 6. Sky & Coral Motion Layer (Scroll Progress Bar, Coral Card Spotlight, Subtle 3D KPI Tilt)
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const bar = document.createElement('div');
  bar.className = 'sky-scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);

  const updateScroll = () => {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    bar.style.width = `${Math.min(100, (window.scrollY / max) * 100)}%`;
  };
  window.addEventListener('scroll', updateScroll, { passive: true });
  updateScroll();

  document.addEventListener('pointermove', (e) => {
    const card = e.target?.closest?.('.wb-card, .wb-kpi-card, .model-selector-card, .stage-card-body, .compare-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const yPct = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    card.style.setProperty('--spot-x', `${xPct.toFixed(1)}%`);
    card.style.setProperty('--spot-y', `${yPct.toFixed(1)}%`);

    if (card.classList.contains('wb-kpi-card')) {
      const rx = ((yPct - 50) / 50) * -2;
      const ry = ((xPct - 50) / 50) * 2;
      card.style.transform = `translateY(-2px) perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    }
  });

  document.addEventListener('pointerout', (e) => {
    const kpi = e.target?.closest?.('.wb-kpi-card');
    if (kpi && !kpi.contains(e.relatedTarget)) {
      kpi.style.transform = '';
    }
  });
}

console.log('BiSpec platform initialized — Sky & Coral Light Theme + Video Hero + Workspace active.');
