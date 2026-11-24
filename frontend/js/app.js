/**
 * app.js
 * BiSpec Pairwise AI — Enterprise Client Application Controller
 *
 * Implements:
 * 1. Scroll-Synced Interactive Video Backdrop (video_1..4 cross-fading)
 * 2. Biology 101 Interactive Explainer Modals
 * 3. Compact Screening Studio (~28% Sidebar) + Upfront Biological Report (~72%)
 * 4. Major Feature: Side-by-Side Target Pair Comparison Matrix (/compare)
 * 5. Dedicated Model Architecture & Benchmarks Hub (/models)
 * 6. User Authentication & Account-Scoped Research History (users_history.db)
 * 7. Clinical Drug Registry (791 records) and Preclinical Test Queue
 * 8. NVIDIA Nemotron + Mistral Large RAG Assistant (/ask)
 */

// Automatically resolve API Base URL
const API_BASE = (window.location.port === '8000') 
  ? '' 
  : `${window.location.protocol}//${window.location.hostname || '127.0.0.1'}:8000`;

// Global Application State
const appState = {
  currentUser: {
    id: 1,
    full_name: "Dr. Elena Rostova",
    role: "Lead Computational Biologist",
    organization: "Genentech Oncology R&D",
    email: "elena.rostova@genebiotech.com",
    avatar_color: "#1E5631"
  },
  authToken: localStorage.getItem('bispec_auth_token') || null,
  targets: [],
  targetDetails: {},
  benchmarkData: null,
  currentPrediction: null,
  activeThreshold: 0.75,
  drugsPage: 0,
  drugsLimit: 50,
  drugsTotal: 791,
  currentPhaseFilter: 'All',
  searchQuery: '',
  researchHistory: [],
  currentTierFilter: 'all'
};

// ==============================================================================
// 1. Application Lifecycle & Initialization
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initTabNavigation();
  initScrollSyncedVideos();
  initAuthSystem();
  initPresetButtons();
  initThresholdSlider();
  initClinicalTableControls();
  initClinicalTestActions();
  initRagAssistant();
  initComparisonTool();
  handleUrlDeepLinking();

  // Load backend resources asynchronously
  await Promise.all([
    fetchSystemStats(),
    fetchTargetGeneList(),
    fetchBenchmarkComparison(),
    fetchClinicalDrugsRegistry(),
    fetchClinicalTestQueue(),
    loadResearchHistory()
  ]);
});


// ==============================================================================
// 2. Navigation Tabs & URL Deep-Linking
// ==============================================================================
function initTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const targetPanelId = tab.getAttribute('data-tab');
      switchNavTab(targetPanelId);
    });
  });

  // Close profile dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const profileTrigger = document.getElementById('userProfileSection');
    if (profileTrigger && !profileTrigger.contains(e.target)) {
      closeUserProfileDropdown();
    }
  });
}

window.switchNavTab = function(targetPanelId) {
  // 1. Close profile dropdown if open
  closeUserProfileDropdown();

  // 2. Update navigation tab buttons
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(t => {
    const isTarget = t.getAttribute('data-tab') === targetPanelId;
    t.classList.toggle('active', isTarget);
    t.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  // 3. Strictly toggle tab content panels (prevent leak across pages)
  const panels = document.querySelectorAll('.tab-content-panel');
  panels.forEach(p => {
    const isTarget = p.id === targetPanelId;
    p.classList.toggle('active', isTarget);
    if (isTarget) {
      p.style.display = (p.id === 'tab-home') ? 'flex' : 'block';
    } else {
      p.style.display = 'none';
    }
  });

  // 4. Video backdrop control: strictly ONLY displayed on tab-home
  const ambientBg = document.getElementById('ambientVideoContainer');
  if (ambientBg) {
    ambientBg.style.display = 'block';
    if (targetPanelId === 'tab-home') {
      document.body.classList.add('home-video-active');
      document.body.classList.remove('clinical-mode-active');
      const v1 = document.getElementById('bgVideo1');
      if (v1 && v1.paused) v1.play().catch(() => {});
    } else {
      document.body.classList.remove('home-video-active');
      document.body.classList.add('clinical-mode-active');
    }
  }

  // 5. Actions on tab activation
  if (targetPanelId === 'tab-benchmark' && appState.benchmarkData) {
    setTimeout(() => {
      if (typeof renderRocCurves === 'function') renderRocCurves(appState.benchmarkData.curves.roc_curves);
      if (typeof renderPrCurves === 'function') renderPrCurves(appState.benchmarkData.curves.pr_curves);
    }, 80);
  } else if (targetPanelId === 'tab-compare') {
    populateCompareDropdowns();
  } else if (targetPanelId === 'tab-rag') {
    const input = document.getElementById('inputRagQuery');
    if (input) setTimeout(() => input.focus(), 100);
  }

  // 6. Update URL hash smoothly
  const hashMapping = {
    'tab-home': '#home',
    'tab-screening': '#studio',
    'tab-compare': '#compare',
    'tab-benchmark': '#models',
    'tab-registry': '#registry',
    'tab-rag': '#assistant'
  };
  if (hashMapping[targetPanelId]) {
    try {
      history.replaceState(null, '', hashMapping[targetPanelId]);
    } catch (e) {}
  }

  // 7. Scroll window to top on tab switch
  window.scrollTo({ top: 0, behavior: 'instant' });
};

function handleUrlDeepLinking() {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  if (path.includes('/compare') || hash === '#compare') {
    switchNavTab('tab-compare');
  } else if (path.includes('/models') || hash === '#models') {
    switchNavTab('tab-benchmark');
  } else if (path.includes('/studio') || hash === '#studio') {
    switchNavTab('tab-screening');
  } else if (path.includes('/registry') || hash === '#registry') {
    switchNavTab('tab-registry');
  } else if (path.includes('/login') || hash === '#login') {
    openLoginModal();
  } else {
    // Default to Home page
    switchNavTab('tab-home');
  }
}


// ==============================================================================
// 3. Scroll-Synced Ambient Video Backdrop (video_1..4 Cross-Fading)
// ==============================================================================
function initScrollSyncedVideos() {
  const sections = document.querySelectorAll('.home-scroll-section');
  if (!sections || sections.length === 0) return;

  const videos = [
    document.getElementById('bgVideo1'),
    document.getElementById('bgVideo2'),
    document.getElementById('bgVideo3'),
    document.getElementById('bgVideo4')
  ].filter(Boolean);

  function activateVideo(index) {
    videos.forEach((v, idx) => {
      if (idx === index) {
        v.classList.add('active');
        if (v.paused) {
          v.play().catch(() => {});
        }
      } else {
        v.classList.remove('active');
      }
    });
  }

  // IntersectionObserver watching the 4 narrative sections
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          const videoIdx = parseInt(entry.target.getAttribute('data-video-index') || '1', 10) - 1;
          activateVideo(videoIdx);
        }
      });
    }, {
      root: null,
      threshold: [0.35, 0.6]
    });

    sections.forEach(sec => observer.observe(sec));
  } else {
    // Fallback scroll listener
    window.addEventListener('scroll', () => {
      const scrollPos = window.scrollY + (window.innerHeight * 0.4);
      sections.forEach((sec, idx) => {
        const top = sec.offsetTop;
        const height = sec.offsetHeight;
        if (scrollPos >= top && scrollPos < top + height) {
          activateVideo(idx);
        }
      });
    }, { passive: true });
  }

  // Ensure initial video begins playback
  if (videos[0] && videos[0].paused) {
    videos[0].play().catch(() => {});
  }
}


// ==============================================================================
// 4. Interactive Biology 101 Modal System
// ==============================================================================
const BIOLOGY_LESSONS = {
  antibody: {
    tag: "MOLECULAR SCAFFOLD",
    title: "1. What is an Antibody (Immunoglobulin)?",
    content: `
      <p>An <strong>antibody</strong> (immunoglobulin, IgG) is a large, Y-shaped glycoprotein synthesized by B-lymphocytes and plasma cells. It functions as the primary effector arm of adaptive humoral immunity by specifically identifying and neutralizing foreign pathogens, toxins, and abnormal neoplastic cells.</p>
      <h4>Structural Anatomy:</h4>
      <ul>
        <li><strong>Fab Regions (Fragment Antigen-Binding):</strong> The two symmetrical upper arms of the 'Y'. Each Fab contains variable domains (V<sub>H</sub> and V<sub>L</sub>) housing complementarity-determining regions (CDRs) that fold into hypervariable paratopes capable of recognizing precise antigenic epitopes with picomolar affinity.</li>
        <li><strong>Fc Region (Fragment Crystallizable):</strong> The constant stem of the 'Y' that binds Fc&gamma; receptors (Fc&gamma;Rs) on cytotoxic natural killer (NK) cells and macrophages, mediating antibody-dependent cellular cytotoxicity (ADCC), antibody-dependent cellular phagocytosis (ADCP), and complement-dependent cytotoxicity (CDC).</li>
      </ul>
      <h4>Significance in Bispecifics:</h4>
      <p>Natural antibodies are strictly monospecific and bivalent (both Fab arms bind the exact same antigen). Bispecific engineering redesigns the scaffold with heterodimerized heavy chains (e.g. Knobs-into-Holes) to co-engage two non-identical targets simultaneously.</p>
    `
  },
  antigen: {
    tag: "RECEPTOR TARGET",
    title: "2. What is an Antigen & Tumor Biomarker?",
    content: `
      <p>An <strong>antigen</strong> is any macromolecule (typically a cell-surface transmembrane glycoprotein, glycolipid, or receptor kinase) capable of binding to an antibody paratope or T-cell receptor.</p>
      <h4>Antigen Classifications in Immuno-Oncology:</h4>
      <ul>
        <li><strong>Tumor-Associated Antigens (TAAs):</strong> Proteins overexpressed on carcinoma cells with low or restricted expression on healthy somatic tissues (e.g. EGFR, c-MET, HER2/ERBB2, Claudin18.2).</li>
        <li><strong>Lineage-Specific Antigens:</strong> Antigens restricted to an entire cell lineage (e.g. MS4A1/CD20 on all mature B-cells). Targeting induces on-target B-cell aplasia, which is clinically manageable with supplemental immunoglobulin infusions.</li>
        <li><strong>T-Cell Effector Co-Receptors:</strong> Monomorphic subunits of the T-cell receptor complex (specifically <strong>CD3E</strong>) engaged to trigger polyclonal cytotoxic degranulation independently of major histocompatibility complex (MHC Class I) presentation.</li>
      </ul>
    `
  },
  bispecific: {
    tag: "SYNTHETIC BIOLOGY",
    title: "3. How Bispecific Antibodies Work",
    content: `
      <p>A <strong>bispecific antibody (BsAb)</strong> is an artificially engineered therapeutic molecule capable of concurrently recognizing and cross-linking two distinct antigen epitopes.</p>
      <h4>Principal Mechanistic Archetypes:</h4>
      <ul>
        <li><strong>T-Cell Redirecting Engagers (BiTEs):</strong> One arm binds a tumor antigen (e.g., CD19, CD20, or DLL3) while the counter-arm binds CD3&epsilon; on resting cytotoxic T-lymphocytes. This enforces an obligate synthetic immunological synapse, stimulating perforin/granzyme release and serial tumor cell lysis.</li>
        <li><strong>Dual Receptor Tyrosine Kinase (RTK) Co-Blockade:</strong> Simultaneously engages two converging growth factor receptors (e.g., <em>Amivantamab</em> targeting EGFR and c-MET), preventing reciprocal bypass transactivation and triggering receptor internalization and lysosomal degradation.</li>
        <li><strong>Spatial Cofactor Mimetics:</strong> Juxtaposes enzyme and substrate in rigid geometric proximity (e.g., <em>Emicizumab</em> bridging activated Factor IXa and Factor X to mimic FVIIIa cofactor function in hemophilia and cancer-associated stroma remodeling).</li>
      </ul>
    `
  },
  synergy: {
    tag: "PAIRWISE CHEMISTRY",
    title: "4. Dual-Target Synergy & Synthetic Lethality",
    content: `
      <p>Single-target antibody monotherapies routinely succumb to acquired drug resistance because cancer cells rapidly activate redundant compensatory pathways (e.g., MET amplification rescuing EGFR inhibition in NSCLC).</p>
      <h4>How BiSpec Pairwise AI Predicts True Synergy:</h4>
      <ul>
        <li><strong>Extinguishing Reciprocal Escape Loops:</strong> Co-targeting both nodes simultaneously deprives the tumor cell of adaptive survival salvage routes, achieving <em>synthetic lethality</em>.</li>
        <li><strong>Avidity-Driven Tumor Selectivity:</strong> Cells co-expressing both Target A and Target B experience exponential bivalent binding avidity, whereas single-positive healthy tissues bind monovalently with low retention—substantially widening the clinical therapeutic safety window.</li>
        <li><strong>40 Cross-Talk Biological Features:</strong> Our machine learning pipeline evaluates physical molecular mass ratio, differential subcellular localization, shared signaling cascades, co-expression correlation, and baseline tissue toxicity to rank pairs by clinical viability.</li>
      </ul>
    `
  }
};

window.openBioModal = function(topic) {
  const modal = document.getElementById('bioModal');
  const tagEl = document.getElementById('bioModalTag');
  const titleEl = document.getElementById('bioModalTitle');
  const bodyEl = document.getElementById('bioModalBody');

  const lesson = BIOLOGY_LESSONS[topic];
  if (!modal || !lesson) return;

  if (tagEl) tagEl.textContent = lesson.tag;
  if (titleEl) titleEl.textContent = lesson.title;
  if (bodyEl) bodyEl.innerHTML = lesson.content;

  modal.style.display = 'flex';
};

window.closeBioModal = function() {
  const modal = document.getElementById('bioModal');
  if (modal) modal.style.display = 'none';
};


// ==============================================================================
// 5. User Authentication & Dedicated Login Portal (Appears First)
// ==============================================================================
function initAuthSystem() {
  // Check if researcher is authenticated in this browser session
  const savedUserJson = sessionStorage.getItem('bispec_authenticated_user');
  
  if (savedUserJson) {
    try {
      const user = JSON.parse(savedUserJson);
      applyUserProfile(user);
      hideLoginPortal();
      // By default show Home tab
      switchNavTab('tab-home');
    } catch (e) {
      showLoginPortal();
    }
  } else {
    // User is NOT logged in: SHOW LOGIN PAGE FIRST!
    showLoginPortal();
  }
}

window.showLoginPortal = function() {
  const portal = document.getElementById('loginPortalView');
  const header = document.getElementById('appHeader');
  const main = document.getElementById('mainAppWorkspace');
  const ambientBg = document.getElementById('ambientVideoContainer');

  if (portal) portal.style.display = 'flex';
  if (header) header.style.display = 'none';
  if (main) main.style.display = 'none';
  if (ambientBg) ambientBg.style.display = 'none'; // Keep login portal clean
  document.body.classList.remove('clinical-mode-active');
  document.body.classList.remove('home-video-active');
};

window.hideLoginPortal = function() {
  const portal = document.getElementById('loginPortalView');
  const header = document.getElementById('appHeader');
  const main = document.getElementById('mainAppWorkspace');

  if (portal) portal.style.display = 'none';
  if (header) header.style.display = 'flex';
  if (main) main.style.display = 'block';
};

window.loginAsDemoUser = async function(userId) {
  const demoAccounts = {
    1: { email: 'elena.rostova@genebiotech.com', password: 'Password123!' },
    2: { email: 'marcus.vance@mskcc-immuno.org', password: 'Password123!' },
    3: { email: 'priya.ramanathan@astrazeneca-rd.com', password: 'Password123!' },
    4: { email: 'arthur.chen@dana-farber.harvard.edu', password: 'Password123!' },
    5: { email: 'sarah.jenkins@amgen-discovery.com', password: 'Password123!' }
  };

  const creds = demoAccounts[userId] || demoAccounts[1];
  await executeAuthentication(creds.email, creds.password);
};

window.submitPortalLogin = async function() {
  const email = (document.getElementById('portalEmail')?.value || '').trim();
  const password = (document.getElementById('portalPassword')?.value || '').trim();
  const alertBox = document.getElementById('portalLoginAlert');
  if (alertBox) alertBox.style.display = 'none';

  if (!email || !password) {
    if (alertBox) {
      alertBox.textContent = 'Please enter both work email and security token/password.';
      alertBox.style.display = 'block';
    }
    return;
  }

  await executeAuthentication(email, password);
};

async function executeAuthentication(email, password) {
  const btn = document.getElementById('btnSubmitPortalLogin');
  const btnText = document.getElementById('portalLoginBtnText');
  const alertBox = document.getElementById('portalLoginAlert');

  try {
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Verifying Institutional Identity...';

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Authentication failed');
    }

    const data = await res.json();
    if (data.token) {
      appState.authToken = data.token;
      localStorage.setItem('bispec_auth_token', data.token);
    }

    // Persist authenticated researcher in sessionStorage
    sessionStorage.setItem('bispec_authenticated_user', JSON.stringify(data.user));
    applyUserProfile(data.user);

    // Transition smoothly into actual application
    hideLoginPortal();
    switchNavTab('tab-home');
    loadResearchHistory();
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = `Sign In Error: ${err.message}`;
      alertBox.style.display = 'block';
    } else {
      alert(`Sign In Notice: ${err.message}`);
    }
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Sign In to Platform';
  }
}

window.signOutResearcher = function() {
  sessionStorage.removeItem('bispec_authenticated_user');
  localStorage.removeItem('bispec_auth_token');
  appState.authToken = null;
  closeUserProfileDropdown();
  showLoginPortal();
};

window.toggleUserProfileDropdown = function(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('userProfileDropdown');
  if (dropdown) {
    dropdown.style.display = (dropdown.style.display === 'none' || !dropdown.style.display) ? 'block' : 'none';
  }
};

window.closeUserProfileDropdown = function() {
  const dropdown = document.getElementById('userProfileDropdown');
  if (dropdown) dropdown.style.display = 'none';
};

function applyUserProfile(user) {
  appState.currentUser = user;
  const nameEl = document.getElementById('userDisplayName');
  const roleEl = document.getElementById('userDisplayRole');
  const avatarEl = document.getElementById('userAvatarCircle');
  const drawerSub = document.getElementById('drawerUserSubtitle');

  // Dropdown items
  const dropName = document.getElementById('dropdownName');
  const dropEmail = document.getElementById('dropdownEmail');
  const dropOrg = document.getElementById('dropdownOrg');
  const dropAvatar = document.getElementById('dropdownAvatar');

  const initials = user.full_name
    .split(' ')
    .filter(n => !n.startsWith('Dr.'))
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ER';

  if (nameEl) nameEl.textContent = user.full_name;
  if (roleEl) roleEl.textContent = user.role;
  if (avatarEl) {
    avatarEl.textContent = initials;
    avatarEl.style.backgroundColor = user.avatar_color || '#10B981';
  }
  if (drawerSub) drawerSub.textContent = `Saved target screenings for ${user.full_name}`;

  if (dropName) dropName.textContent = user.full_name;
  if (dropEmail) dropEmail.textContent = user.email || '';
  if (dropOrg) dropOrg.textContent = user.organization || '';
  if (dropAvatar) {
    dropAvatar.textContent = initials;
    dropAvatar.style.backgroundColor = user.avatar_color || '#10B981';
  }

  loadResearchHistory();
}

window.quickFillDemoLogin = function(email, password) {
  executeAuthentication(email, password);
};

window.openLoginModal = function() {
  showLoginPortal();
};

window.closeLoginModal = function() {
  hideLoginPortal();
};

window.submitLoginForm = async function() {
  const email = (document.getElementById('loginEmail')?.value || '').trim();
  const password = (document.getElementById('loginPassword')?.value || '').trim();
  await executeAuthentication(email, password);
};

// Drawer controls
window.openResearchDrawer = function() {
  const drawer = document.getElementById('researchDrawer');
  if (drawer) {
    drawer.classList.add('open');
    loadResearchHistory();
  }
};

window.closeResearchDrawer = function() {
  const drawer = document.getElementById('researchDrawer');
  if (drawer) drawer.classList.remove('open');
};

const btnOpenDrawer = document.getElementById('btnOpenResearchDrawer');
if (btnOpenDrawer) {
  btnOpenDrawer.addEventListener('click', openResearchDrawer);
}

async function loadResearchHistory() {
  try {
    const uid = appState.currentUser?.id || 1;
    const res = await fetch(`${API_BASE}/api/research-history?user_id=${uid}`, {
      headers: appState.authToken ? { 'Authorization': `Bearer ${appState.authToken}` } : {}
    });
    if (!res.ok) return;

    const data = await res.json();
    appState.researchHistory = data.history || [];

    const badgeHeader = document.getElementById('researchHistoryHeaderCount');
    const badgeDrawer = document.getElementById('drawerTotalCount');
    if (badgeHeader) badgeHeader.textContent = `${appState.researchHistory.length}`;
    if (badgeDrawer) badgeDrawer.textContent = `${appState.researchHistory.length} Saved Runs`;

    renderResearchHistoryItems(appState.researchHistory);
  } catch (e) {}
}

function renderResearchHistoryItems(items) {
  const container = document.getElementById('researchHistoryList');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
        No saved research screenings yet for this account.<br>
        Run any prediction in the Studio and it will automatically persist here.
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => {
    const scorePct = (item.compatibility_score * 100).toFixed(1);
    return `
      <div class="history-card-item">
        <div class="history-card-header">
          <span class="history-pair-title">${item.target_a} + ${item.target_b}</span>
          <span class="history-score-val">${scorePct}%</span>
        </div>
        <div class="history-meta-sub">
          <span>${item.priority_tier || 'Tier'} &bull; ${item.indication} &bull; ${item.clinical_status || 'Preclinical'}</span>
        </div>
        <div class="history-actions-row">
          <button type="button" class="btn-history-action" onclick="reloadSavedScreening('${item.target_a}', '${item.target_b}', '${item.indication}')">
            Reload in Studio
          </button>
          <button type="button" class="btn-history-action" onclick="addSavedPairToCompare('${item.target_a}', '${item.target_b}')">
            Add to Compare
          </button>
          <button type="button" class="btn-remove-queue" style="margin-left:auto;" onclick="deleteResearchItem(${item.id})">
            &times;
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.reloadSavedScreening = function(ta, tb, ind) {
  closeResearchDrawer();
  switchNavTab('tab-screening');
  applyTargetPreset(ta, tb, ind);
};

window.addSavedPairToCompare = function(ta, tb) {
  closeResearchDrawer();
  switchNavTab('tab-compare');
  const selA = document.getElementById('compareSelectA1');
  const selB = document.getElementById('compareSelectB1');
  if (selA) selA.value = ta;
  if (selB) selB.value = tb;
  executePairComparison();
};

window.deleteResearchItem = async function(id) {
  try {
    const res = await fetch(`${API_BASE}/api/research-history/${id}?user_id=${appState.currentUser?.id || 1}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      loadResearchHistory();
    }
  } catch (e) {}
};

window.exportResearchHistoryCsv = function() {
  if (!appState.researchHistory || appState.researchHistory.length === 0) {
    alert("No research history to export.");
    return;
  }

  const header = "ID,Target Arm 1,Target Arm 2,Indication,Model,Compatibility Score,Priority Tier,Double-Positive Expression,Safety Score,Gene Similarity,Clinical Status,Date\n";
  const rows = appState.researchHistory.map(r => 
    `"${r.id}","${r.target_a}","${r.target_b}","${r.indication}","${r.model_name}","${(r.compatibility_score * 100).toFixed(1)}%","${r.priority_tier}","${r.double_positive_expr || 'N/A'}","${r.safety_score || 'N/A'}","${r.gene_similarity || 'N/A'}","${r.clinical_status || 'Preclinical'}","${r.created_at || ''}"`
  ).join("\n");

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `research_history_${appState.currentUser?.full_name?.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};


// ==============================================================================
// 6. Major Feature: Side-by-Side Target Pair Comparison (/compare)
// ==============================================================================
function initComparisonTool() {
  const btn = document.getElementById('btnRunCompare');
  if (btn) {
    btn.addEventListener('click', executePairComparison);
  }
}

function populateCompareDropdowns() {
  const slots = [
    { a: 'compareSelectA1', b: 'compareSelectB1' },
    { a: 'compareSelectA2', b: 'compareSelectB2' },
    { a: 'compareSelectA3', b: 'compareSelectB3' },
    { a: 'compareSelectA4', b: 'compareSelectB4' }
  ];

  if (!appState.targets || appState.targets.length === 0) return;

  slots.forEach(slot => {
    const elA = document.getElementById(slot.a);
    const elB = document.getElementById(slot.b);
    if (!elA || !elB) return;

    const valA = elA.value;
    const valB = elB.value;

    elA.innerHTML = appState.targets.map(t => `<option value="${t}" ${t === valA ? 'selected' : ''}>${t}</option>`).join('');
    elB.innerHTML = appState.targets.map(t => `<option value="${t}" ${t === valB ? 'selected' : ''}>${t}</option>`).join('');
  });
}

const COMPARISON_SUITES = {
  benchmarks: [
    { a: 'EGFR', b: 'MET', ind: 'Non-Small Cell Lung Cancer' },
    { a: 'MS4A1', b: 'CD3E', ind: 'B-Cell Lymphoma' },
    { a: 'PDCD1', b: 'CTLA4', ind: 'NSCLC' },
    { a: 'VEGFA', b: 'ANGPT2', ind: 'Non-Small Cell Lung Cancer' }
  ],
  tce: [
    { a: 'MS4A1', b: 'CD3E', ind: 'B-Cell Lymphoma' },
    { a: 'CLDN18', b: 'CD3E', ind: 'Gastric Cancer' },
    { a: 'DLL3', b: 'CD3E', ind: 'Small Cell Lung Cancer' },
    { a: 'CD19', b: 'CD3E', ind: 'Acute Lymphoblastic Leukemia' }
  ],
  checkpoints: [
    { a: 'PDCD1', b: 'CTLA4', ind: 'Metastatic Melanoma' },
    { a: 'PDCD1', b: 'TIGIT', ind: 'Non-Small Cell Lung Cancer' },
    { a: 'CTLA4', b: 'LAG3', ind: 'Advanced Solid Tumors' },
    { a: 'CD274', b: 'TNFRSF9', ind: 'NSCLC & Colorectal' }
  ]
};

window.loadComparisonSuite = function(suiteKey) {
  const suite = COMPARISON_SUITES[suiteKey];
  if (!suite) return;

  const slots = [
    { a: 'compareSelectA1', b: 'compareSelectB1' },
    { a: 'compareSelectA2', b: 'compareSelectB2' },
    { a: 'compareSelectA3', b: 'compareSelectB3' },
    { a: 'compareSelectA4', b: 'compareSelectB4' }
  ];

  suite.forEach((pair, idx) => {
    if (slots[idx]) {
      const elA = document.getElementById(slots[idx].a);
      const elB = document.getElementById(slots[idx].b);
      if (elA) elA.value = pair.a;
      if (elB) elB.value = pair.b;
    }
  });

  executePairComparison();
};

window.executePairComparison = async function() {
  const slots = [
    { a: 'compareSelectA1', b: 'compareSelectB1' },
    { a: 'compareSelectA2', b: 'compareSelectB2' },
    { a: 'compareSelectA3', b: 'compareSelectB3' },
    { a: 'compareSelectA4', b: 'compareSelectB4' }
  ];

  const pairsToCompare = [];
  slots.forEach(slot => {
    const ta = document.getElementById(slot.a)?.value;
    const tb = document.getElementById(slot.b)?.value;
    if (ta && tb && ta !== tb) {
      pairsToCompare.push({ target_a: ta, target_b: tb, indication: 'Non-Small Cell Lung Cancer' });
    }
  });

  if (pairsToCompare.length === 0) {
    alert("Please select at least 1 valid dual-target combination to compare.");
    return;
  }

  const container = document.getElementById('comparisonMatrixContainer');
  if (container) {
    container.innerHTML = `<div class="loading-report-spinner">Evaluating ${pairsToCompare.length} combinations side-by-side using XGBoost pairwise model...</div>`;
  }

  try {
    const res = await fetch(`${API_BASE}/api/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairs: pairsToCompare })
    });

    if (!res.ok) throw new Error('Failed to evaluate pair comparison');
    const data = await res.json();
    renderComparisonMatrixTable(data.comparisons || []);
  } catch (err) {
    if (container) {
      container.innerHTML = `<div style="color:var(--coral-dark); padding:2rem; text-align:center;">Error: ${err.message}</div>`;
    }
  }
};

function renderComparisonMatrixTable(comparisons) {
  const container = document.getElementById('comparisonMatrixContainer');
  if (!container) return;

  if (comparisons.length === 0) {
    container.innerHTML = `<p class="text-muted-sm">No comparison data available.</p>`;
    return;
  }

  // Find max score index
  let maxScore = -1;
  let maxIdx = 0;
  comparisons.forEach((c, idx) => {
    if (c.compatibility_score > maxScore) {
      maxScore = c.compatibility_score;
      maxIdx = idx;
    }
  });

  let html = `
    <table class="compare-matrix-table">
      <thead>
        <tr>
          <th>Metric / Target Dimension</th>
          ${comparisons.map((c, idx) => `
            <th class="${idx === maxIdx ? 'highlight-winner-col' : ''}">
              <div style="font-size:0.95rem; font-weight:800; color:var(--navy-dark);">${c.pair_label}</div>
              ${idx === maxIdx ? '<span class="tag-invariant" style="margin-top:4px; display:inline-block;">★ Lead Candidate</span>' : ''}
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
        <!-- 1. Prediction Score & Tier -->
        <tr>
          <td><strong>Prediction Score &amp; Tier</strong></td>
          ${comparisons.map((c, idx) => `
            <td class="${idx === maxIdx ? 'highlight-winner-col' : ''}">
              <div style="font-size:1.45rem; font-weight:800; font-family:var(--font-mono); color:var(--navy-dark);">${c.compatibility_percentage}%</div>
              <span class="indicator-pill" style="margin-top:4px; font-size:0.72rem; ${getTierBadgeInlineStyle(c.priority_tier)}">${c.priority_tier}</span>
            </td>
          `).join('')}
        </tr>

        <!-- 2. Double-Positive Expression -->
        <tr>
          <td><strong>Double-Positive Co-Expression</strong></td>
          ${comparisons.map((c, idx) => `
            <td class="${idx === maxIdx ? 'highlight-winner-col' : ''}">
              <span class="indicator-pill" style="font-size:0.75rem; ${getLevelBadgeStyle(c.double_positive_expr)}">
                ${c.double_positive_desc}
              </span>
            </td>
          `).join('')}
        </tr>

        <!-- 3. Safety Score (Low Off-Target Risk) -->
        <tr>
          <td><strong>Safety Index &bull; On-Target Risk</strong></td>
          ${comparisons.map((c, idx) => `
            <td class="${idx === maxIdx ? 'highlight-winner-col' : ''}">
              <span class="indicator-pill" style="font-size:0.75rem; ${getLevelBadgeStyle(c.safety_score)}">
                ${c.safety_desc}
              </span>
            </td>
          `).join('')}
        </tr>

        <!-- 4. Gene Similarity -->
        <tr>
          <td><strong>Gene Sequence / Class Similarity</strong></td>
          ${comparisons.map((c, idx) => `
            <td class="${idx === maxIdx ? 'highlight-winner-col' : ''}">
              <span class="indicator-pill" style="font-size:0.75rem; ${getLevelBadgeStyle(c.gene_similarity)}">
                ${c.gene_similarity_desc}
              </span>
            </td>
          `).join('')}
        </tr>

        <!-- 5. Clinical Precedent Status -->
        <tr>
          <td><strong>Clinical Precedents in Dataset</strong></td>
          ${comparisons.map((c, idx) => `
            <td class="${idx === maxIdx ? 'highlight-winner-col' : ''}">
              <div style="font-size:0.82rem; font-weight:700; color:var(--navy-dark);">${c.clinical_status}</div>
              ${c.matched_drugs && c.matched_drugs.length > 0 ? `
                <div style="font-size:0.74rem; color:var(--text-muted); margin-top:2px;">
                  Matched: ${c.matched_drugs.join(', ')}
                </div>
              ` : ''}
            </td>
          `).join('')}
        </tr>

        <!-- 6. Comparative Synergy Dimensions -->
        <tr>
          <td><strong>Comparative Biological Synergy</strong></td>
          ${comparisons.map((c, idx) => `
            <td class="${idx === maxIdx ? 'highlight-winner-col' : ''}">
              <div style="font-size:0.75rem; font-family:var(--font-mono); margin-bottom:2px;">Synergy: ${c.radar_metrics.biological_synergy}%</div>
              <div class="progress-track"><div class="progress-bar-fill emerald" style="width:${c.radar_metrics.biological_synergy}%;"></div></div>
            </td>
          `).join('')}
        </tr>

        <tr>
          <td><strong>Pathway Overlap Proxy</strong></td>
          ${comparisons.map((c, idx) => `
            <td class="${idx === maxIdx ? 'highlight-winner-col' : ''}">
              <div style="font-size:0.75rem; font-family:var(--font-mono); margin-bottom:2px;">Overlap: ${c.radar_metrics.pathway_overlap}%</div>
              <div class="progress-track"><div class="progress-bar-fill blue" style="width:${c.radar_metrics.pathway_overlap}%;"></div></div>
            </td>
          `).join('')}
        </tr>

        <tr>
          <td><strong>Tumor Relevance</strong></td>
          ${comparisons.map((c, idx) => `
            <td class="${idx === maxIdx ? 'highlight-winner-col' : ''}">
              <div style="font-size:0.75rem; font-family:var(--font-mono); margin-bottom:2px;">Relevance: ${c.radar_metrics.tumor_relevance}%</div>
              <div class="progress-track"><div class="progress-bar-fill purple" style="width:${c.radar_metrics.tumor_relevance}%;"></div></div>
            </td>
          `).join('')}
        </tr>

        <!-- Actions Row -->
        <tr>
          <td><strong>Pipeline Actions</strong></td>
          ${comparisons.map((c, idx) => `
            <td class="${idx === maxIdx ? 'highlight-winner-col' : ''}">
              <button type="button" class="btn-history-action" onclick="reloadSavedScreening('${c.target_a}', '${c.target_b}', '${c.indication}')">
                Open in Studio &rarr;
              </button>
            </td>
          `).join('')}
        </tr>
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

function getTierBadgeInlineStyle(tier) {
  if (tier && tier.includes('Tier 1')) return 'background:#DCFCE7; color:#15803D; border:1px solid #86EFAC; font-weight:800;';
  if (tier && tier.includes('Tier 2')) return 'background:#E0F2FE; color:#0369A1; border:1px solid #7DD3FC; font-weight:800;';
  if (tier && tier.includes('Tier 3')) return 'background:#FEF3C7; color:#B45309; border:1px solid #FCD34D; font-weight:800;';
  return 'background:#FEE2E2; color:#B91C1C; border:1px solid #FCA5A5; font-weight:800;';
}

function getLevelBadgeStyle(level) {
  if (level === 'High') return 'background:#DCFCE7; color:#15803D; border:1px solid #86EFAC; font-weight:700;';
  if (level === 'Medium') return 'background:#E0F2FE; color:#0369A1; border:1px solid #7DD3FC; font-weight:700;';
  return 'background:#FEE2E2; color:#B91C1C; border:1px solid #FCA5A5; font-weight:700;';
}

window.exportComparisonMatrixCsv = function() {
  const slots = [
    { a: 'compareSelectA1', b: 'compareSelectB1' },
    { a: 'compareSelectA2', b: 'compareSelectB2' },
    { a: 'compareSelectA3', b: 'compareSelectB3' },
    { a: 'compareSelectA4', b: 'compareSelectB4' }
  ];

  const pairs = [];
  slots.forEach(slot => {
    const ta = document.getElementById(slot.a)?.value;
    const tb = document.getElementById(slot.b)?.value;
    if (ta && tb && ta !== tb) pairs.push(`${ta}:${tb}`);
  });

  if (pairs.length === 0) {
    alert("Select at least 1 pair to export.");
    return;
  }

  window.location.href = `${API_BASE}/api/compare/export?pairs=${encodeURIComponent(pairs.join(','))}`;
};


// ==============================================================================
// 7. Screening Studio (Layout Fix & Upfront Biological Report)
// ==============================================================================
window.applyTargetPreset = function(targetA, targetB, indication) {
  const selA = document.getElementById('selectTargetA');
  const selB = document.getElementById('selectTargetB');
  const selInd = document.getElementById('selectIndication');

  if (selA) selA.value = targetA;
  if (selB) selB.value = targetB;
  if (selInd && indication) selInd.value = indication;

  updateTargetInspectors();
  runPairwisePrediction();
};

window.switchReportTab = function(tabKey) {
  const tabs = {
    'moa': { btn: 'tabBtnMoa', panel: 'reportMoAPanel' },
    'resistance': { btn: 'tabBtnResistance', panel: 'reportResistancePanel' },
    'safety': { btn: 'tabBtnSafety', panel: 'reportSafetyPanel' },
    'protocol': { btn: 'tabBtnProtocol', panel: 'reportProtocolPanel' }
  };

  Object.entries(tabs).forEach(([k, item]) => {
    const isTarget = k === tabKey;
    const btn = document.getElementById(item.btn);
    const panel = document.getElementById(item.panel);
    if (btn) btn.classList.toggle('active', isTarget);
    if (panel) panel.classList.toggle('active', isTarget);
  });
};

function initPresetButtons() {
  // Preset buttons initialized via inline onclick handlers
}

function initThresholdSlider() {
  const slider = document.getElementById('sliderCutoff');
  const display = document.getElementById('valCutoff');
  if (slider && display) {
    slider.addEventListener('input', (e) => {
      display.textContent = parseFloat(e.target.value).toFixed(2);
      appState.activeThreshold = parseFloat(e.target.value);
    });
  }
}

async function fetchSystemStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    if (!res.ok) return;
    const data = await res.json();
    const aucEl = document.getElementById('statChampionAuc');
    const drugsEl = document.getElementById('statTotalDrugs');
    if (aucEl && data.champion_auc) aucEl.textContent = data.champion_auc.toFixed(4);
    if (drugsEl && data.total_drugs) drugsEl.textContent = `${data.total_drugs}`;
  } catch (e) {}
}

async function fetchTargetGeneList() {
  try {
    const res = await fetch(`${API_BASE}/api/targets`);
    if (!res.ok) return;
    const data = await res.json();
    appState.targets = data.targets || [];
    appState.targetDetails = data.details || {};

    const selA = document.getElementById('selectTargetA');
    const selB = document.getElementById('selectTargetB');

    const options = appState.targets.map(t => `<option value="${t}">${t}</option>`).join('');
    if (selA) selA.innerHTML = '<option value="">-- Choose Antigen 1 --</option>' + options;
    if (selB) selB.innerHTML = '<option value="">-- Choose Antigen 2 --</option>' + options;

    if (selA) selA.addEventListener('change', updateTargetInspectors);
    if (selB) selB.addEventListener('change', updateTargetInspectors);

    populateCompareDropdowns();
  } catch (e) {}
}

function updateTargetInspectors() {
  const selA = document.getElementById('selectTargetA');
  const selB = document.getElementById('selectTargetB');
  const infoA = document.getElementById('infoTargetA');
  const infoB = document.getElementById('infoTargetB');

  const ta = selA?.value;
  const tb = selB?.value;

  if (infoA) {
    if (ta && appState.targetDetails[ta]) {
      const d = appState.targetDetails[ta];
      infoA.innerHTML = `<strong>${d.symbol}</strong> &bull; ${d.category} &bull; ${d.localization}<br><span style="color:var(--text-muted); font-size:0.72rem;">Clinical Precedents: ${d.clinical_drugs_count} records</span>`;
    } else {
      infoA.textContent = "Select Target Arm 1 above";
    }
  }

  if (infoB) {
    if (tb && appState.targetDetails[tb]) {
      const d = appState.targetDetails[tb];
      infoB.innerHTML = `<strong>${d.symbol}</strong> &bull; ${d.category} &bull; ${d.localization}<br><span style="color:var(--text-muted); font-size:0.72rem;">Clinical Precedents: ${d.clinical_drugs_count} records</span>`;
    } else {
      infoB.textContent = "Select Target Arm 2 above";
    }
  }
}

window.runPairwisePrediction = async function() {
  const selA = document.getElementById('selectTargetA');
  const selB = document.getElementById('selectTargetB');
  const selInd = document.getElementById('selectIndication');
  const selModel = document.getElementById('selectModel');
  const btn = document.getElementById('btnPredict');

  const targetA = selA?.value;
  const targetB = selB?.value;
  const indication = selInd?.value || "Non-Small Cell Lung Cancer";
  const modelName = selModel?.value || "XGBoost + Pairwise AI";

  if (!targetA || !targetB) {
    showDangerAlert("Please select both Target Arm 1 and Target Arm 2.");
    return;
  }

  if (targetA === targetB) {
    showDangerAlert("Target Arm 1 and Target Arm 2 must be distinct biological genes. Bispecific antibodies require two different target arms.");
    return;
  }

  hideDangerAlert();

  // Show result workspace
  const emptyPrompt = document.getElementById('emptyScreeningPrompt');
  const resultContainer = document.getElementById('predictionResultContainer');
  if (emptyPrompt) emptyPrompt.style.display = 'none';
  if (resultContainer) resultContainer.style.display = 'block';

  // Set loading states
  if (btn) btn.disabled = true;
  document.getElementById('displayTargetPair').textContent = `${targetA} + ${targetB}`;
  document.getElementById('displayScorePct').textContent = '--%';
  document.getElementById('clinicalVerdictText').textContent = 'Computing 40-dimensional pairwise biological features...';

  try {
    const res = await fetch(`${API_BASE}/api/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_a: targetA,
        target_b: targetB,
        indication: indication,
        model_name: modelName,
        user_id: appState.currentUser?.id || 1
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Prediction failed');
    }

    const data = await res.json();
    appState.currentPrediction = data;

    // 1. Populate Score & Tier
    const scorePct = data.compatibility_percentage.toFixed(1);
    document.getElementById('displayScorePct').textContent = `${scorePct}%`;
    document.getElementById('displayModel').textContent = data.model_used;
    document.getElementById('clinicalVerdictText').textContent = data.clinical_verdict;

    const tierBadge = document.getElementById('displayTierBadge');
    if (tierBadge) {
      tierBadge.textContent = data.classification_badge;
      tierBadge.className = `tier-pill-large ${getTierClass(data.priority_tier)}`;
    }

    // 2. Render Radar Chart & 5 Dimension Bars
    if (typeof renderSynergyRadar === 'function') {
      renderSynergyRadar(data.radar_metrics);
    }
    updateDimensionBars(data.radar_metrics);

    // 3. Render Matched Clinical Precedents
    renderMatchedDrugs(data.matched_clinical_drugs || []);

    // 4. Fetch Biological Explanation (MoA) Dossier Upfront
    fetchBiologicalDossier(targetA, targetB, indication, data.compatibility_score);

    // Refresh user research history count
    loadResearchHistory();
  } catch (err) {
    showDangerAlert(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
};

function getTierClass(tier) {
  if (tier && tier.includes('Tier 1')) return 'tier-1';
  if (tier && tier.includes('Tier 2')) return 'tier-2';
  if (tier && tier.includes('Tier 3')) return 'tier-3';
  return 'tier-review';
}

function updateDimensionBars(radar) {
  const dims = [
    { id: 'BioSynergy', val: radar.biological_synergy },
    { id: 'PathwayOverlap', val: radar.pathway_overlap },
    { id: 'TumorRelevance', val: radar.tumor_relevance },
    { id: 'SafetyProfile', val: radar.safety_profile },
    { id: 'StructuralFit', val: radar.structural_fit }
  ];

  dims.forEach(d => {
    const valEl = document.getElementById(`val${d.id}`);
    const barEl = document.getElementById(`bar${d.id}`);
    if (valEl) valEl.textContent = `${d.val}%`;
    if (barEl) barEl.style.width = `${d.val}%`;
  });
}

function renderMatchedDrugs(drugs) {
  const container = document.getElementById('matchedDrugsList');
  if (!container) return;

  if (drugs.length === 0) {
    container.innerHTML = `
      <div style="font-size:0.8rem; color:var(--text-muted); padding:0.5rem 0;">
        No approved drugs currently target this exact antigen combination.<br>
        <strong>High novel first-in-class discovery potential.</strong>
      </div>
    `;
    return;
  }

  container.innerHTML = drugs.map(d => `
    <div class="matched-drug-item">
      <div>
        <strong style="font-size:0.84rem; color:var(--navy-dark);">${d.drug}</strong>
        <span style="display:block; font-size:0.72rem; color:var(--text-muted);">${d.organization || 'Sponsor'} &bull; ${d.indication}</span>
      </div>
      <span class="indicator-pill" style="font-size:0.7rem; background:#DCFCE7; color:#15803D; border:1px solid #86EFAC;">
        ${d.phase}
      </span>
    </div>
  `).join('');
}

async function fetchBiologicalDossier(targetA, targetB, indication, score) {
  const moaEl = document.getElementById('reportMoA');
  const resEl = document.getElementById('reportResistance');
  const safeEl = document.getElementById('reportSafety');
  const protoEl = document.getElementById('reportOutlook');

  try {
    const res = await fetch(`${API_BASE}/api/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_a: targetA,
        target_b: targetB,
        indication: indication,
        score: score
      })
    });

    if (!res.ok) throw new Error('Dossier generation failed');
    const data = await res.json();

    if (moaEl) moaEl.innerHTML = data.mechanism_of_action || 'Mechanism generated.';
    if (resEl) resEl.innerHTML = data.resistance_bypass || 'Resistance suppression analyzed.';
    if (safeEl) safeEl.innerHTML = data.safety_and_toxicity || 'Safety profile assessed.';
    if (protoEl) protoEl.innerHTML = data.clinical_outlook || 'Protocol recommendations compiled.';
  } catch (err) {
    if (moaEl) moaEl.innerHTML = `<span style="color:var(--coral-dark);">Notice: ${err.message}</span>`;
  }
}

window.addCurrentPairToComparison = function() {
  if (!appState.currentPrediction) return;
  const p = appState.currentPrediction;
  switchNavTab('tab-compare');
  const selA = document.getElementById('compareSelectA1');
  const selB = document.getElementById('compareSelectB1');
  if (selA) selA.value = p.target_a;
  if (selB) selB.value = p.target_b;
  executePairComparison();
};

window.nominateCurrentPairToClinicalQueue = async function() {
  if (!appState.currentPrediction) return;
  const p = appState.currentPrediction;

  try {
    const res = await fetch(`${API_BASE}/api/clinical-tests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_a: p.target_a,
        target_b: p.target_b,
        indication: p.indication,
        compatibility_score: p.compatibility_score,
        priority_tier: p.priority_tier,
        notes: p.clinical_verdict
      })
    });

    if (res.ok) {
      alert(`Candidate ${p.target_a} + ${p.target_b} successfully added to Clinical Test Queue!`);
      fetchClinicalTestQueue(appState.currentTierFilter);
    }
  } catch (e) {}
};

function showDangerAlert(msg) {
  const banner = document.getElementById('dangerAlertBanner');
  const text = document.getElementById('dangerAlertText');
  if (banner && text) {
    text.textContent = msg;
    banner.style.display = 'block';
  }
}

function hideDangerAlert() {
  const banner = document.getElementById('dangerAlertBanner');
  if (banner) banner.style.display = 'none';
}


// ==============================================================================
// 8. Preclinical Clinical Test Queue Controller
// ==============================================================================
function initClinicalTestActions() {
  // Handled via filter buttons
}

window.filterClinicalQueue = function(tier) {
  appState.currentTierFilter = tier;
  const buttons = document.querySelectorAll('.tier-filter-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === tier);
  });
  fetchClinicalTestQueue(tier);
};

async function fetchClinicalTestQueue(tierFilter = 'all') {
  const tbody = document.getElementById('clinicalQueueTableBody');
  const badge = document.getElementById('queueCountBadge');
  if (!tbody) return;

  try {
    const url = (tierFilter && tierFilter !== 'all')
      ? `${API_BASE}/api/clinical-tests?tier=${encodeURIComponent(tierFilter)}`
      : `${API_BASE}/api/clinical-tests`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load queue');
    const data = await res.json();

    if (badge) {
      badge.textContent = `${data.total} Candidates`;
    }

    if (!data.records || data.records.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">
          No candidate pairs currently queued under ${tierFilter}. Screen a candidate above to nominate.
        </td></tr>
      `;
      return;
    }

    tbody.innerHTML = data.records.map(r => {
      const scorePct = (r.compatibility_score * 100).toFixed(1);
      return `
        <tr>
          <td><strong style="font-family:var(--font-mono); color:var(--navy-primary);">#${r.id}</strong></td>
          <td><strong style="font-family:var(--font-mono); color:var(--navy-dark);">${r.target_a} + ${r.target_b}</strong></td>
          <td>${r.indication}</td>
          <td><strong style="font-family:var(--font-mono);">${scorePct}%</strong></td>
          <td><span class="indicator-pill" style="font-size:0.74rem; ${getTierBadgeInlineStyle(r.priority_tier)}">${r.priority_tier}</span></td>
          <td style="font-size:0.78rem; color:var(--text-muted);">${r.drug_precedents || 'None (Novel)'}</td>
          <td>
            <span class="preclinical-status-pill">${r.status}</span>
          </td>
          <td>
            <button type="button" class="btn-remove-queue" onclick="removeCandidateFromQueue(${r.id})">Remove</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {}
}

window.removeCandidateFromQueue = async function(id) {
  try {
    const res = await fetch(`${API_BASE}/api/clinical-tests/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchClinicalTestQueue(appState.currentTierFilter);
    }
  } catch (e) {}
};


// ==============================================================================
// 9. Model Benchmarks & Curves Controller (/models)
// ==============================================================================
async function fetchBenchmarkComparison() {
  try {
    const res = await fetch(`${API_BASE}/api/benchmark`);
    if (!res.ok) return;
    const data = await res.json();
    appState.benchmarkData = data;

    const tbody = document.getElementById('benchmarkTableBody');
    if (tbody && data.metrics?.models) {
      tbody.innerHTML = data.metrics.models.map(m => `
        <tr class="${m.is_champion ? 'champion-row' : ''}">
          <td>
            <strong>${m.model_name}</strong>
            ${m.is_champion ? '<span class="tag-invariant" style="margin-left:6px;">Champion</span>' : ''}
            <div style="font-size:0.75rem; color:var(--text-muted);">${m.description || ''}</div>
          </td>
          <td><strong style="font-family:var(--font-mono);">${m.roc_auc.toFixed(4)}</strong></td>
          <td><strong style="font-family:var(--font-mono); color:${m.is_champion ? '#10B981' : 'inherit'};">${m.pr_auc.toFixed(4)}</strong></td>
          <td>${(m.accuracy * 100).toFixed(1)}%</td>
          <td>${(m.precision * 100).toFixed(1)}%</td>
          <td>${(m.recall * 100).toFixed(1)}%</td>
          <td style="font-family:var(--font-mono);">${m.f1_score.toFixed(4)}</td>
        </tr>
      `).join('');
    }

    // Render Feature Importance Bars
    const featContainer = document.getElementById('featureImportanceContainer');
    if (featContainer && data.feature_importance) {
      featContainer.innerHTML = data.feature_importance.slice(0, 16).map(f => {
        const pct = (f.importance * 100).toFixed(1);
        return `
          <div class="feat-row">
            <span class="feat-name" title="${f.feature}">${f.feature}</span>
            <div class="feat-track"><div class="feat-fill" style="width: ${Math.min(100, f.importance * 350)}%;"></div></div>
            <span class="feat-score">${pct}%</span>
          </div>
        `;
      }).join('');
    }
  } catch (e) {}
}


// ==============================================================================
// 10. Clinical Drug Database Registry (791 Records)
// ==============================================================================
function initClinicalTableControls() {
  const searchInput = document.getElementById('inputDrugSearch');
  const phaseSelect = document.getElementById('selectDrugPhase');
  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      appState.searchQuery = e.target.value.trim();
      appState.drugsPage = 0;
      fetchClinicalDrugsRegistry();
    });
  }

  if (phaseSelect) {
    phaseSelect.addEventListener('change', (e) => {
      appState.currentPhaseFilter = e.target.value;
      appState.drugsPage = 0;
      fetchClinicalDrugsRegistry();
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (appState.drugsPage > 0) {
        appState.drugsPage--;
        fetchClinicalDrugsRegistry();
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if ((appState.drugsPage + 1) * appState.drugsLimit < appState.drugsTotal) {
        appState.drugsPage++;
        fetchClinicalDrugsRegistry();
      }
    });
  }
}

async function fetchClinicalDrugsRegistry() {
  const tbody = document.getElementById('drugsTableBody');
  const summary = document.getElementById('paginationSummary');
  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');
  if (!tbody) return;

  const offset = appState.drugsPage * appState.drugsLimit;
  let url = `${API_BASE}/api/drugs?limit=${appState.drugsLimit}&offset=${offset}`;
  if (appState.searchQuery) url += `&search=${encodeURIComponent(appState.searchQuery)}`;
  if (appState.currentPhaseFilter && appState.currentPhaseFilter !== 'All') {
    url += `&phase=${encodeURIComponent(appState.currentPhaseFilter)}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    appState.drugsTotal = data.total;

    if (summary) {
      summary.textContent = `Showing records ${offset + 1}–${Math.min(offset + appState.drugsLimit, data.total)} of ${data.total}`;
    }

    if (btnPrev) btnPrev.disabled = (appState.drugsPage === 0);
    if (btnNext) btnNext.disabled = ((appState.drugsPage + 1) * appState.drugsLimit >= data.total);

    tbody.innerHTML = data.records.map(d => `
      <tr>
        <td><strong style="color:var(--navy-dark);">${d.drug}</strong></td>
        <td>
          <span class="indicator-pill" style="font-size:0.72rem; ${d.phase.includes('Approved') ? 'background:#DCFCE7; color:#15803D; border:1px solid #86EFAC;' : 'background:#F1F5F9; color:#334155; border:1px solid #CBD5E1;'}">
            ${d.phase}
          </span>
        </td>
        <td style="font-family:var(--font-mono); font-size:0.8rem;">${d.target_name}</td>
        <td><strong style="font-family:var(--font-mono); color:var(--emerald-dark);">${d.target_a} + ${d.target_b}</strong></td>
        <td>${d.indication}</td>
        <td>${d.organization}</td>
      </tr>
    `).join('');
  } catch (e) {}
}


// ==============================================================================
// 11. Grounded RAG Biologist Assistant (/ask)
// ==============================================================================
function initRagAssistant() {
  const inputEl = document.getElementById('inputRagQuery');
  const submitBtn = document.getElementById('btnSubmitRag');
  const container = document.getElementById('ragResponseContainer');
  const queryDisplay = document.getElementById('ragQueryDisplay');
  const answerBody = document.getElementById('ragAnswerBody');
  const sourcesDisplay = document.getElementById('ragSourcesDisplay');

  async function handleQuery(queryText) {
    const q = (queryText || inputEl?.value || '').trim();
    if (!q) {
      if (inputEl) inputEl.focus();
      return;
    }

    if (inputEl) inputEl.value = q;
    if (container) container.style.display = 'block';
    if (queryDisplay) queryDisplay.textContent = q;
    if (answerBody) {
      answerBody.innerHTML = `
        <div style="color:var(--text-muted); font-style:italic;">
          Searching vector embeddings and synthesizing grounded biological response...
        </div>
      `;
    }
    if (sourcesDisplay) sourcesDisplay.innerHTML = '';

    try {
      if (submitBtn) submitBtn.disabled = true;

      // Query POST /ask first (returning {"answer": "<generated_text>"})
      let res;
      try {
        res = await fetch(`${API_BASE}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q })
        });
      } catch (e) {
        res = null;
      }

      if (!res || !res.ok) {
        res = await fetch(`${API_BASE}/api/rag/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, question: q })
        });
      }

      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();

      if (answerBody) {
        answerBody.textContent = data.answer || 'The provided context does not contain enough information.';
      }

      if (sourcesDisplay) {
        const sources = Array.isArray(data.sources) 
          ? data.sources 
          : ['Application Knowledge Base', '791 Clinical Drug Records', 'biology_paper.pdf'];
        sourcesDisplay.innerHTML = sources.map(s => `
          <span class="tag-invariant" style="background:#E2E8F0; color:#1E293B; border-color:#CBD5E1;">📄 ${s}</span>
        `).join('');
      }
    } catch (err) {
      if (answerBody) {
        answerBody.innerHTML = `<span style="color:var(--coral-dark);">Error: ${err.message}</span>`;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', () => handleQuery());
  }

  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleQuery();
      }
    });
  }

  // Preset chips
  document.querySelectorAll('.rag-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      handleQuery(q);
    });
  });
}

// Global PDF Dossier Print Action
window.printScreeningDossier = function() {
  window.print();
};

const btnHeaderExport = document.getElementById('btnExportHeaderReport');
if (btnHeaderExport) {
  btnHeaderExport.addEventListener('click', () => window.print());
}

// QR Code Modal Trigger (Dynamic Network URL Detection)
const btnQr = document.getElementById('btnOpenQrModal');
if (btnQr) {
  btnQr.addEventListener('click', () => {
    const modal = document.getElementById('qrModal');
    const urlText = document.getElementById('qrModalUrlText');
    const qrImg = document.getElementById('qrModalImg');

    const host = window.location.hostname;
    const currentUrl = (host && host !== '127.0.0.1' && host !== 'localhost')
      ? `${window.location.protocol}//${window.location.host}`
      : 'http://10.214.45.176:8000';

    if (urlText) urlText.textContent = currentUrl;
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(currentUrl)}`;
    }
    if (modal) modal.style.display = 'flex';
  });
}
