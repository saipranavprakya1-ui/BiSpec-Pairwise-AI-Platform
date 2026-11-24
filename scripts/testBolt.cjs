const https = require('https');
const fs = require('fs');

let key = '';
try {
  const env = fs.readFileSync('.env', 'utf8');
  const match = env.match(/NVIDIA_API_KEY=([^\r\n]+)/);
  if (match) key = match[1].trim();
} catch (e) {}

function test(model) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model,
      messages: [
        { role: 'user', content: 'In 2 sentences, describe the mechanism of action of an EGFR x MET bispecific antibody.' }
      ],
      temperature: 0.2,
      max_tokens: 500
    });

    const t0 = Date.now();
    const req = https.request('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 15000
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        const dt = Date.now() - t0;
        try {
          const parsed = JSON.parse(b);
          console.log(`[${model}] (${dt}ms) status ${res.statusCode}:`, parsed.choices[0].message);
        } catch (e) {
          console.log(`[${model}] (${dt}ms) error:`, b.slice(0, 200));
        }
        resolve();
      });
    });
    req.on('error', err => {
      console.log(`[${model}] req err:`, err.message);
      resolve();
    });
    req.write(payload);
    req.end();
  });
}

(async () => {
  await test('nvidia/nemotron-3.5-bolt-e4b');
  await test('nvidia/nemotron-3.5-lightning-30b-a3b');
})();
