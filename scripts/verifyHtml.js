import http from 'http';

http.get('http://localhost:3000', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('HTML size:', body.length);
    console.log('Contains #stage (Overview):', body.includes('id="stage"'));
    console.log('Contains #problem (Problem & Solution):', body.includes('id="problem"'));
    console.log('Contains #mechanism-viz (Target Binding):', body.includes('id="mechanism-viz"'));
    
    // Check that pipeline is NOT in view-about, but IS in view-app
    const aboutPart = body.split('id="view-app"')[0];
    const appPart = body.split('id="view-app"')[1];

    console.log('Pipeline NOT in view-about:', !aboutPart.includes('id="pipeline-mount"'));
    console.log('Results NOT in view-about:', !aboutPart.includes('id="results-mount"'));
    console.log('Pipeline IS in appPart:', appPart.includes('id="pipeline-mount"'));
    console.log('Results IS in appPart:', appPart.includes('id="results-mount"'));
    console.log('Contains #screenTargetA:', appPart.includes('id="screenTargetA"'));
    console.log('Contains #screenTargetB:', appPart.includes('id="screenTargetB"'));
    console.log('Contains Chen & Guestrin citation:', body.includes('Chen') && body.includes('Guestrin'));
    console.log('Contains Zhang et al. citation:', body.includes('Zhang') && body.includes('s00432-024-05740-3'));
  });
}).on('error', (err) => {
  console.error('Error fetching http://localhost:3000:', err);
});
