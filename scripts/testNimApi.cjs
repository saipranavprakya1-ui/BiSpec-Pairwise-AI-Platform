const https = require('https');
const fs = require('fs');

let key = '';
try {
  const env = fs.readFileSync('.env', 'utf8');
  const match = env.match(/NVIDIA_API_KEY=([^\r\n]+)/);
  if (match) key = match[1].trim();
} catch (e) {}

function testModel(modelName, maxTok) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: 'You are an oncology AI. Always respond strictly in valid JSON.' },
        { role: 'user', content: 'Explain EGFR x MET bispecific antibody in JSON with mechanism_of_action, resistance_bypass, safety_and_toxicity, clinical_outlook' }
      ],
      temperature: 0.2,
      max_tokens: maxTok
    });

    const t0 = Date.now();
    const req = https.request('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        const dt = Date.now() - t0;
        try {
          const parsed = JSON.parse(b);
          const msg = parsed.choices[0].message;
          console.log(`[${modelName}] took ${dt}ms, status ${res.statusCode}:`);
          console.log('content:', msg.content ? msg.content.slice(0, 200) + '...' : 'NULL');
          console.log('reasoning_len:', (msg.reasoning_content || '').length);
        } catch (e) {
          console.log(`[${modelName}] ERR:`, b.slice(0, 200));
        }
        resolve();
      });
    });
    req.write(payload);
    req.end();
  });
}

(async () => {
  await testModel('mistralai/mistral-large-4-1t-a52b', 1024);
  await testModel('nvidia/nemotron-3.5-lightning-30b-a3b', 4096);
})();
