/**
 * aiDiscoverBar.js
 * Natural-Language "Ask & Discover" Command Bar (Perplexity-Style Oncology Search).
 * Calls POST /api/discover-prompt (NVIDIA NIM + Live Clinical Safe Ensemble + 791 Registry)
 * to propose and live-score the top 3 bispecific target pairs for any researcher prompt.
 */

export function mountAiDiscoverBar(container, { onScreenPair } = {}) {
  if (!container) return;

  const starterPrompts = [
    'Find a safe NSCLC bispecific that overcomes EGFR TKI resistance',
    'Suggest a T-cell engager for solid epithelial tumors with low off-tumor toxicity',
    'Propose dual immune checkpoint combinations for exhausted CD8+ T-cells'
  ];

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <form id="aiDiscoverForm" style="display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch;">
        <div style="position: relative; flex: 1 1 320px;">
          <input
            type="text"
            id="aiDiscoverInput"
            class="form-select"
            placeholder="Describe your oncology goal (e.g., 'Find a safe NSCLC bispecific overcoming EGFR resistance')..."
            style="width: 100%; padding: 13px 16px; font-size: 0.9rem; background: var(--surface); border: 1px solid var(--tint); border-radius: 10px; color: var(--surface);"
            autocomplete="off"
            required
          />
        </div>
        <button type="submit" id="aiDiscoverSubmit" class="wb-btn-primary" style="padding: 12px 22px; font-size: 0.86rem; white-space: nowrap;">
          <span>Discover Pairs &rarr;</span>
        </button>
      </form>

      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
        <span style="font-family: var(--font-mono); font-size: 0.68rem; color: var(--color-muted); text-transform: uppercase;">Try:</span>
        ${starterPrompts.map((p) => `
          <button type="button" class="wb-preset-chip js-discover-starter" data-prompt="${p.replace(/"/g, '&quot;')}" style="font-size: 0.72rem; padding: 5px 10px;">
            ${p}
          </button>
        `).join('')}
      </div>

      <div id="aiDiscoverOutput"></div>
    </div>
  `;

  const form = container.querySelector('#aiDiscoverForm');
  const input = container.querySelector('#aiDiscoverInput');
  const btn = container.querySelector('#aiDiscoverSubmit');
  const out = container.querySelector('#aiDiscoverOutput');
  const starters = container.querySelectorAll('.js-discover-starter');

  const runDiscovery = async (promptText) => {
    const q = (promptText || '').trim();
    if (!q || !out) return;
    if (input) input.value = q;
    if (btn) btn.disabled = true;

    out.innerHTML = `
      <div style="padding: 20px; border-radius: 10px; background: var(--surface); border: 1px solid var(--wb-border); display: flex; align-items: center; gap: 10px; font-family: var(--font-mono); font-size: 0.78rem; color: var(--color-dots);">
        <span class="inference-spinner" aria-hidden="true"></span>
        <span>Querying NVIDIA NIM &amp; scoring candidate pairs live with Clinical Safe Ensemble (95.06% ROC-AUC)...</span>
      </div>
    `;

    try {
      const resp = await fetch('/api/discover-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q })
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const cands = data.candidates || [];

      if (!cands.length) {
        out.innerHTML = `<div style="padding: 16px; color: var(--color-muted); font-size: 0.84rem;">No matching pairs returned. Try describing a cancer type, target, or mechanism.</div>`;
        return;
      }

      const cardsHtml = cands.map((c, idx) => {
        const scoreColor = c.score_pct >= 80 ? 'var(--wb-accent)' : (c.score_pct >= 60 ? 'var(--wb-amber)' : 'var(--danger)');
        return `
          <div style="background: var(--surface); border: 1px solid ${idx === 0 ? 'var(--tint)' : 'var(--wb-border)'}; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span style="font-family: var(--font-mono); font-size: 0.65rem; color: ${idx === 0 ? 'var(--wb-accent)' : 'var(--color-muted)'}; text-transform: uppercase;">
                  ${idx === 0 ? '★ Top AI Lead' : `Candidate #${idx + 1}`} &bull; ${c.quorum} Quorum
                </span>
                <strong class="tabular-nums" style="font-family: var(--font-mono); font-size: 1.05rem; color: ${scoreColor};">
                  ${Number(c.score_pct).toFixed(1)}%
                </strong>
              </div>
              <div style="font-family: var(--font-mono); font-size: 1.08rem; font-weight: 700; margin-bottom: 6px;">
                <span style="color: var(--wb-accent);">${c.target_a}</span>
                <span style="color: var(--color-muted); font-weight: 300;"> &times; </span>
                <span style="color: var(--wb-amber);">${c.target_b}</span>
              </div>
              <div style="font-family: var(--font-mono); font-size: 0.66rem; color: var(--wb-sky); margin-bottom: 8px;">
                ${c.clinical_status}
              </div>
              <p style="font-size: 0.8rem; color: var(--color-dots); line-height: 1.5; margin: 0;">
                ${c.rationale}
              </p>
            </div>
            <button type="button" class="wb-btn-ghost js-discover-open" data-a="${c.target_a}" data-b="${c.target_b}" style="width: 100%; justify-content: center; padding: 8px; font-size: 0.76rem;">
              Open ${c.target_a} &times; ${c.target_b} in Studio &rarr;
            </button>
          </div>
        `;
      }).join('');

      out.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--color-dots); padding: 10px 14px; border-radius: 9px; background: var(--primary-soft); border: 1px solid var(--primary-soft);">
            <span>${data.summary || 'Top 3 bispecific target pairs verified by live Clinical Safe Ensemble.'}</span>
            <span style="font-family: var(--font-mono); font-size: 0.65rem; color: var(--wb-accent);">${data.provider}</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
            ${cardsHtml}
          </div>
        </div>
      `;

      out.querySelectorAll('.js-discover-open').forEach((b) => {
        b.addEventListener('click', () => {
          if (onScreenPair) onScreenPair(b.dataset.a, b.dataset.b);
        });
      });
    } catch (err) {
      out.innerHTML = `<div style="padding: 14px; border-radius: 8px; background: var(--accent-soft); border: 1px solid var(--accent); color: var(--accent); font-size: 0.8rem;">Live AI Discovery requires the Python backend on port 8000 (restart <code>start_app.bat</code> if you just updated).</div>`;
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runDiscovery(input.value);
  });

  starters.forEach((s) => {
    s.addEventListener('click', () => runDiscovery(s.dataset.prompt));
  });
}
