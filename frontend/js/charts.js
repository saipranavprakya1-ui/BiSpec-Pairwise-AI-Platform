/**
 * charts.js
 * BiSpec Pairwise AI: Interactive Chart.js visualizations for ROC Curves, PR Curves, and Synergy Radar.
 * Glassmorphic High-Tech Palette:
 * - Green (#10B981): Champion model & verified synergy
 * - Red (#EF4444): Suspicious / low synergy / random baseline
 * - Cyan & Purple: Benchmark baselines & highlights
 */

let rocChartInstance = null;
let prChartInstance = null;
let radarChartInstance = null;

// High-Tech Biotech Glassmorphic Palette
const MODEL_COLORS = {
  'XGBoost + Pairwise AI': { stroke: '#10B981', fill: 'rgba(16, 185, 129, 0.20)', width: 3 }, // Champion
  'Random Forest': { stroke: '#38BDF8', fill: 'transparent', width: 2 },                         // Sky Blue
  'GBDT': { stroke: '#818CF8', fill: 'transparent', width: 2 },                                  // Indigo
  'Logistic Regression': { stroke: '#F59E0B', fill: 'transparent', width: 2 },                   // Amber
  'Decision Tree': { stroke: '#C084FC', fill: 'transparent', width: 1.8 },                       // Purple
  'DNN (MLP)': { stroke: '#94A3B8', fill: 'transparent', width: 1.8 }                            // Slate Gray
};

/**
 * Render or update the ROC Curves comparison chart.
 */
function renderRocCurves(rocData) {
  const ctx = document.getElementById('chartRoc') || document.getElementById('rocChart');
  if (!ctx) return;

  const datasets = [];

  // Baseline diagonal (Random Guess: AUC = 0.50)
  datasets.push({
    label: 'Random Baseline (AUC = 0.50)',
    data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    borderColor: '#EF4444',
    borderWidth: 1.5,
    borderDash: [5, 5],
    pointRadius: 0,
    fill: false
  });

  // Add each model curve
  for (const [modelName, info] of Object.entries(rocData)) {
    const styling = MODEL_COLORS[modelName] || { stroke: '#64748b', fill: 'transparent', width: 1.5 };
    const points = info.points.map(p => ({ x: p.fpr, y: p.tpr }));

    datasets.push({
      label: `${modelName} (AUC: ${info.auc.toFixed(4)})`,
      data: points,
      borderColor: styling.stroke,
      backgroundColor: styling.fill,
      borderWidth: styling.width,
      pointRadius: modelName.includes('XGBoost') ? 2 : 0,
      pointHoverRadius: 5,
      tension: 0.15,
      fill: modelName.includes('XGBoost')
    });
  }

  if (rocChartInstance) {
    rocChartInstance.destroy();
  }

  rocChartInstance = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#CBD5E1',
            font: { size: 11, family: "'Plus Jakarta Sans', sans-serif", weight: '600' },
            boxWidth: 12,
            padding: 12
          }
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleColor: '#FFFFFF',
          bodyColor: '#CBD5E1',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 10
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 1,
          title: {
            display: true,
            text: 'False Positive Rate (1 - Specificity)',
            color: '#FFFFFF',
            font: { size: 12, weight: '700' }
          },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { color: '#94A3B8' }
        },
        y: {
          min: 0,
          max: 1.02,
          title: {
            display: true,
            text: 'True Positive Rate (Sensitivity)',
            color: '#FFFFFF',
            font: { size: 12, weight: '700' }
          },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { color: '#94A3B8' }
        }
      }
    }
  });
}

/**
 * Render or update the Precision-Recall (PR) Curves chart.
 */
function renderPrCurves(prData) {
  const ctx = document.getElementById('chartPr') || document.getElementById('prChart');
  if (!ctx) return;

  const datasets = [];

  for (const [modelName, info] of Object.entries(prData)) {
    const styling = MODEL_COLORS[modelName] || { stroke: '#64748b', fill: 'transparent', width: 1.5 };
    const points = info.points.map(p => ({ x: p.recall, y: p.precision }));

    datasets.push({
      label: `${modelName} (PR-AUC: ${info.pr_auc.toFixed(4)})`,
      data: points,
      borderColor: styling.stroke,
      backgroundColor: styling.fill,
      borderWidth: styling.width,
      pointRadius: modelName.includes('XGBoost') ? 2 : 0,
      tension: 0.15,
      fill: modelName.includes('XGBoost')
    });
  }

  if (prChartInstance) {
    prChartInstance.destroy();
  }

  prChartInstance = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#CBD5E1',
            font: { size: 11, family: "'Plus Jakarta Sans', sans-serif", weight: '600' },
            boxWidth: 12,
            padding: 12
          }
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleColor: '#FFFFFF',
          bodyColor: '#CBD5E1',
          padding: 10
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 1,
          title: {
            display: true,
            text: 'Recall (Sensitivity)',
            color: '#FFFFFF',
            font: { size: 12, weight: '700' }
          },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { color: '#94A3B8' }
        },
        y: {
          min: 0.5,
          max: 1.02,
          title: {
            display: true,
            text: 'Precision (Positive Predictive Value)',
            color: '#FFFFFF',
            font: { size: 12, weight: '700' }
          },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { color: '#94A3B8' }
        }
      }
    }
  });
}

/**
 * Render or update 5-Axis Biological Synergy Radar Chart (Glassmorphic Theme).
 */
function updateRadarChart(metrics, isVerified = true) {
  const ctx = document.getElementById('radarChart');
  if (!ctx) return;

  const labels = [
    'Biological Synergy',
    'Pathway Overlap',
    'Tumor Relevance',
    'Safety Profile',
    'Molecular Fit'
  ];

  const values = [
    metrics.biological_synergy || 50,
    metrics.pathway_overlap || 50,
    metrics.tumor_relevance || 50,
    metrics.safety_profile || 50,
    metrics.structural_fit || 50
  ];

  const strokeColor = isVerified ? '#10B981' : '#EF4444';
  const fillColor = isVerified ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';

  if (radarChartInstance) {
    radarChartInstance.data.datasets[0].data = values;
    radarChartInstance.data.datasets[0].borderColor = strokeColor;
    radarChartInstance.data.datasets[0].backgroundColor = fillColor;
    radarChartInstance.data.datasets[0].pointBorderColor = strokeColor;
    radarChartInstance.update();
    return;
  }

  radarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Pairwise Synergy Dimensions',
        data: values,
        borderColor: strokeColor,
        backgroundColor: fillColor,
        pointBackgroundColor: '#FFFFFF',
        pointBorderColor: strokeColor,
        pointBorderWidth: 2,
        pointRadius: 4,
        borderWidth: 2.2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        r: {
          angleLines: { color: 'rgba(255, 255, 255, 0.12)' },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          pointLabels: {
            color: '#FFFFFF',
            font: { size: 11, weight: '700', family: "'Plus Jakarta Sans', sans-serif" }
          },
          ticks: {
            backdropColor: 'transparent',
            color: '#94A3B8',
            stepSize: 20
          },
          suggestedMin: 0,
          suggestedMax: 100
        }
      }
    }
  });
}
