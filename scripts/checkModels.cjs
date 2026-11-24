const https = require('https');
const fs = require('fs');

let key = '';
try {
  const env = fs.readFileSync('.env', 'utf8');
  const match = env.match(/NVIDIA_API_KEY=([^\r\n]+)/);
  if (match) key = match[1].trim();
} catch (e) {}

const req = https.request('https://integrate.api.nvidia.com/v1/models', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + key
  }
}, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    try {
      const data = JSON.parse(b);
      console.log('Available models count:', data.data ? data.data.length : 0);
      const ids = (data.data || []).map(m => m.id);
      const nemotrons = ids.filter(id => id.includes('nemotron') || id.includes('llama') || id.includes('mistral') || id.includes('deepseek') || id.includes('qwen'));
      console.log('Relevant models:', nemotrons);
    } catch (e) {
      console.log('ERR:', b);
    }
  });
});
req.on('error', err => console.error('Req error:', err.message));
req.end();
