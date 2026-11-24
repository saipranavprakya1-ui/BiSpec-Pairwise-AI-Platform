import { spawn } from 'child_process';
import http from 'http';

const WebSocketClient = globalThis.WebSocket;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
  console.log('[*] Launching Headless Chrome on port 9222...');
  const chromeProcess = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    'http://localhost:3000'
  ], { stdio: 'ignore' });

  // Wait for Chrome CDP endpoint
  let versionData = null;
  for (let i = 0; i < 30; i++) {
    try {
      versionData = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json/list', (res) => {
          let raw = '';
          res.on('data', c => raw += c);
          res.on('end', () => resolve(JSON.parse(raw)));
        }).on('error', reject);
      });
      if (versionData && versionData.length > 0) break;
    } catch (e) {
      await sleep(300);
    }
  }

  if (!versionData || versionData.length === 0) {
    console.error('[-] Failed to connect to Chrome debugging port.');
    chromeProcess.kill();
    process.exit(1);
  }

  const tab = versionData.find(t => t.type === 'page') || versionData[0];
  console.log('[+] Connected to tab:', tab.url);

  const ws = new WebSocketClient(tab.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  let msgId = 1;
  const pendingRequests = new Map();
  const consoleMessages = [];
  const errors = [];

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.method === 'Console.messageAdded') {
      const text = msg.params.message.text;
      const level = msg.params.message.level;
      consoleMessages.push({ level, text });
      if (level === 'error') {
        errors.push(text);
      }
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
      const type = msg.params.type;
      consoleMessages.push({ level: type, text });
      if (type === 'error') {
        errors.push(text);
      }
    }
    if (msg.id && pendingRequests.has(msg.id)) {
      const { resolve } = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      resolve(msg);
    }
  });

  function sendCommand(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      pendingRequests.set(id, { resolve });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendCommand('Console.enable');
  await sendCommand('Runtime.enable');
  await sendCommand('Page.enable');

  await sendCommand('Page.navigate', { url: 'http://localhost:3000' });
  await sleep(2500);

  // Evaluate browser test suite
  const evalResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const results = {};
        
        // 1. Initial Views Check
        const viewAbout = document.getElementById('view-about');
        const viewLogin = document.getElementById('view-login');
        const viewApp = document.getElementById('view-app');
        results.initialAboutVisible = viewAbout && getComputedStyle(viewAbout).display !== 'none';
        results.initialLoginHidden = viewLogin && getComputedStyle(viewLogin).display === 'none';
        results.initialAppHidden = viewApp && getComputedStyle(viewApp).display === 'none';

        // 2. Fixed Stage Canvas (Spanning entire About page)
        const stage = document.getElementById('stage');
        results.stageIsFixed = stage && getComputedStyle(stage).position === 'fixed';
        results.stageSpansViewport = stage && (getComputedStyle(stage).width === window.innerWidth + 'px' || getComputedStyle(stage).width === '100vw' || parseInt(getComputedStyle(stage).width) > 300);

        // 3. Test Login Portal Opening & Styling
        window.__appWorkspace.showLoginPortal();
        results.loginModalVisible = viewLogin && getComputedStyle(viewLogin).display !== 'none';
        const modalOverlay = document.querySelector('.login-view-overlay');
        results.modalOverlayIsFixed = modalOverlay && getComputedStyle(modalOverlay).position === 'fixed';
        const personaCards = document.querySelectorAll('.persona-card');
        results.personaCardsCount = personaCards.length;

        // Sign in via persona
        window.__appWorkspace.signInWithPersona('Dr. Elena Vance, PhD', 'Chief Scientific Officer', 'Genentech', 'EV');
        results.appWorkspaceVisible = viewApp && getComputedStyle(viewApp).display !== 'none';
        results.aboutHiddenAfterLogin = viewAbout && getComputedStyle(viewAbout).display === 'none';

        // 4. Panel 5 (Clinical Registry) Checks - All 791 combinations
        window.__appWorkspace.switchAppTab('registry');
        const panelRegistry = document.getElementById('app-panel-registry');
        results.panelRegistryVisible = panelRegistry && getComputedStyle(panelRegistry).display !== 'none';
        results.totalDatasetCombinationsCount = window.__appWorkspace.allClinicalRecords.length;

        // Toggle Show All 791
        const btnToggleAll = document.getElementById('btnRegToggleAll');
        if (btnToggleAll) {
          btnToggleAll.click();
        }
        const regAllRows = document.querySelectorAll('#registryTableBody tr');
        results.allRowsRenderedCount = regAllRows.length;

        // Filter test
        window.__appWorkspace.filterClinicalRegistry('Amivantamab');
        const regFilteredRows = document.querySelectorAll('#registryTableBody tr');
        results.registryFilteredRowsCount = regFilteredRows.length;

        // Reset filter
        window.__appWorkspace.filterClinicalRegistry('');

        // 5. Panel 2 (Screening Studio) checks with RAG
        window.__appWorkspace.switchAppTab('screening');
        const panelScreening = document.getElementById('app-panel-screening');
        results.panelScreeningVisible = panelScreening && getComputedStyle(panelScreening).display !== 'none';

        const selA = document.getElementById('screenTargetA');
        const selB = document.getElementById('screenTargetB');
        results.targetOptionsCountA = selA ? selA.querySelectorAll('option').length : 0;
        results.targetOptionsCountB = selB ? selB.querySelectorAll('option').length : 0;

        // Select EGFR x MET
        if (selA) selA.value = 'EGFR';
        if (selB) selB.value = 'MET';
        window.__appWorkspace.updateTargetInspector('A', 'EGFR');
        window.__appWorkspace.updateTargetInspector('B', 'MET');

        // Run inference
        window.__appWorkspace.runPairwiseInference();

        return results;
      })()
    `,
    returnByValue: true
  });

  // Wait for RAG response to finish loading and populate (up to 8s)
  let ragReady = false;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const check = await sendCommand('Runtime.evaluate', {
      expression: `!!document.getElementById('btnAskRag')`,
      returnByValue: true
    });
    if (check?.result?.result?.value === true) {
      ragReady = true;
      break;
    }
  }

  const ragResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const ragCard = document.getElementById('studioRagContainer');
        return {
          ragReady: ${ragReady},
          hasRagCard: !!ragCard,
          hasAiBadge: ragCard ? !!ragCard.querySelector('.rag-badge-ai') : false,
          aiBadgeText: ragCard && ragCard.querySelector('.rag-badge-ai') ? ragCard.querySelector('.rag-badge-ai').textContent : '',
          hasMoaSection: ragCard ? ragCard.textContent.toLowerCase().includes('mechanism of action') : false,
          hasResistanceSection: ragCard ? ragCard.textContent.toLowerCase().includes('resistance') : false,
          hasSafetySection: ragCard ? ragCard.textContent.toLowerCase().includes('safety') : false,
          hasOutlookSection: ragCard ? ragCard.textContent.toLowerCase().includes('clinical outlook') : false,
          hasAskBiologistSection: ragCard ? !!ragCard.querySelector('#ragBiologistInput') : false
        };
      })()
    `,
    returnByValue: true
  });

  // Mobile 375px Viewport test
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true
  });
  await sleep(600);

  const mobileOverflow = await sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        const docWidth = document.documentElement.clientWidth;
        const overflowing = [];
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > docWidth + 1) {
            overflowing.push({
              tag: el.tagName,
              id: el.id,
              className: (el.className && typeof el.className === 'string') ? el.className : '',
              width: Math.round(rect.width),
              right: Math.round(rect.right)
            });
          }
        });
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          overflowing: overflowing.slice(0, 5)
        };
      })()
    `,
    returnByValue: true
  });

  console.log('\n======================================================');
  console.log('BROWSER TEST SUITE VERIFICATION REPORT:');
  console.log('======================================================');
  console.log('Core Suite Results:', JSON.stringify(evalResult?.result?.result?.value, null, 2));
  console.log('\nStudio NVIDIA Nemotron RAG Report:', JSON.stringify(ragResult?.result?.result?.value, null, 2));
  console.log('\nMobile 375px Responsive Overflow Test:', JSON.stringify(mobileOverflow?.result?.result?.value, null, 2));

  console.log('\nConsole Errors count:', errors.length);
  if (errors.length > 0) {
    console.error('Errors encountered:', errors);
  } else {
    console.log('[+] ZERO CONSOLE ERRORS RECORDED ACROSS ALL USER FLOWS!');
  }

  // Cleanup
  ws.close();
  chromeProcess.kill();
  process.exit(errors.length > 0 ? 1 : 0);
}

runTest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
