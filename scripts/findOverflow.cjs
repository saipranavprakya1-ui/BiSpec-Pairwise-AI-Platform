const http = require('http');

function sendCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    const msg = JSON.stringify({ id, method, params });
    const onMsg = (data) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.id === id) {
        ws.off('message', onMsg);
        resolve(parsed);
      }
    };
    ws.on('message', onMsg);
    ws.send(msg);
  });
}

(async () => {
  const wsMod = await import('ws');
  const WebSocket = wsMod.default;

  const tabs = await new Promise((resolve) => {
    http.get('http://localhost:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
  });

  const tab = tabs.find(t => t.url.includes('localhost:3000'));
  if (!tab) {
    console.log('No tab found');
    return;
  }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  const overflowEls = await sendCommand(ws, 'Runtime.evaluate', {
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
              className: el.className,
              right: rect.right,
              docWidth
            });
          }
        });
        return overflowing.slice(0, 10);
      })()
    `,
    returnByValue: true
  });

  console.log('Overflowing elements at 375px:', JSON.stringify(overflowEls?.result?.result?.value, null, 2));
  ws.close();
})();
