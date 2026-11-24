const https = require('https');
const fs = require('fs');

let key = '';
try {
  const env = fs.readFileSync('.env', 'utf8');
  const match = env.match(/NVIDIA_API_KEY=([^\r\n]+)/);
  if (match) key = match[1].trim();
} catch (e) {}

const prompt = `You are an expert computational immunologist and oncology drug discovery scientist.
Analyze the following bispecific antibody target combination:
- Target 1: EGFR
- Target 2: MET
- Indication: NSCLC
- Compatibility Score: 94.2%

Respond strictly in valid JSON format with these exact 4 keys:
{
  "mechanism_of_action": "2-3 sentences explaining the synergistic molecular mechanism of action.",
  "resistance_bypass": "2 sentences on how co-targeting overcomes antigen loss, bypass signaling, or mutational resistance.",
  "safety_and_toxicity": "2 sentences evaluating on-target/off-tumor safety, selectivity window, or toxicity risks.",
  "clinical_outlook": "2 sentences on translational feasibility, clinical benchmark precedents, and priority."
}`;

const payload = JSON.stringify({
  model: 'nvidia/nemotron-3.5-bolt-e4b',
  messages: [
    { role: 'system', content: 'You are an oncology drug discovery AI. Always respond strictly in valid JSON format.' },
    { role: 'user', content: prompt }
  ],
  temperature: 0.2,
  max_tokens: 1024
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
    console.log(`[Bolt] (${dt}ms) status ${res.statusCode}:`);
    try {
      const parsed = JSON.parse(b);
      console.log('CONTENT:', parsed.choices[0].message.content);
    } catch (e) {
      console.log('ERR:', b);
    }
  });
});
req.write(payload);
req.end();
