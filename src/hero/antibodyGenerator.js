/**
 * Procedural Bispecific Antibody (IgG-like) Generator
 * Constructs an exact 40,000-dot point-cloud representation with even voxel-cap sampling.
 * Domains:
 *   - Fc Stem (CH3, CH2 domains across 2 heavy chains + carbohydrate bridge) (aPart = 0)
 *   - Hinge region (aPart = 0)
 *   - Fab Arm 1 (Target A: CH1, CL, VH, VL domains) (aPart = 1)
 *   - Fab Arm 2 (Target B: CH1, CL, VH, VL domains) (aPart = 2)
 *   - Binding Site CDR Tips on both Fab arms (aPart = 3)
 */

export const TOTAL_DOTS = 40000;

/**
 * Domain definitions for symmetric Y-shaped bispecific IgG
 */
function createDomains() {
  const armAngle = (30 * Math.PI) / 180; // 30 deg from vertical = 60 deg total opening
  const sinA = Math.sin(armAngle);
  const cosA = Math.cos(armAngle);

  // Arm 1 (Target A - Left, angle -30 deg)
  const u1x = -sinA;
  const u1y = cosA;
  const p1x = cosA;
  const p1y = sinA;

  // Arm 2 (Target B - Right, angle +30 deg)
  const u2x = sinA;
  const u2y = cosA;
  const p2x = -cosA;
  const p2y = sinA;

  return [
    // ----------------- FC STEM (Chain 1 & 2) -----------------
    // CH3 Domains (Base of Fc)
    { name: 'Fc_CH3_Left', part: 0, cx: -0.44, cy: -2.6, cz: 0.0, rx: 0.54, ry: 0.74, rz: 0.44, rotZ: 0.06, weight: 1.0 },
    { name: 'Fc_CH3_Right', part: 0, cx: 0.44, cy: -2.6, cz: 0.0, rx: 0.54, ry: 0.74, rz: 0.44, rotZ: -0.06, weight: 1.0 },

    // CH2 Domains (Mid Fc)
    { name: 'Fc_CH2_Left', part: 0, cx: -0.52, cy: -1.3, cz: 0.0, rx: 0.5, ry: 0.68, rz: 0.42, rotZ: 0.08, weight: 0.95 },
    { name: 'Fc_CH2_Right', part: 0, cx: 0.52, cy: -1.3, cz: 0.0, rx: 0.5, ry: 0.68, rz: 0.42, rotZ: -0.08, weight: 0.95 },

    // Central Glycan / Carbohydrate Core between CH2
    { name: 'Fc_Core', part: 0, cx: 0.0, cy: -1.3, cz: 0.0, rx: 0.32, ry: 0.52, rz: 0.32, rotZ: 0, weight: 0.5 },

    // ----------------- HINGE REGION -----------------
    { name: 'Hinge_Core', part: 0, cx: 0.0, cy: -0.25, cz: 0.0, rx: 0.42, ry: 0.48, rz: 0.36, rotZ: 0, weight: 0.6 },
    { name: 'Hinge_Stalk_Left', part: 0, cx: -0.4, cy: 0.15, cz: 0.0, rx: 0.34, ry: 0.44, rz: 0.32, rotZ: -armAngle * 0.5, weight: 0.5 },
    { name: 'Hinge_Stalk_Right', part: 0, cx: 0.4, cy: 0.15, cz: 0.0, rx: 0.34, ry: 0.44, rz: 0.32, rotZ: armAngle * 0.5, weight: 0.5 },

    // ----------------- FAB ARM 1: TARGET A (LEFT) -----------------
    // Constant Domains (CH1 and CL)
    {
      name: 'ArmA_CH1',
      part: 1,
      cx: 1.7 * u1x - 0.44 * p1x,
      cy: 1.7 * u1y - 0.44 * p1y,
      cz: 0.0,
      rx: 0.48,
      ry: 0.72,
      rz: 0.4,
      rotZ: -armAngle,
      weight: 1.0
    },
    {
      name: 'ArmA_CL',
      part: 1,
      cx: 1.7 * u1x + 0.44 * p1x,
      cy: 1.7 * u1y + 0.44 * p1y,
      cz: 0.0,
      rx: 0.48,
      ry: 0.72,
      rz: 0.4,
      rotZ: -armAngle,
      weight: 1.0
    },

    // Variable Domains (VH and VL)
    {
      name: 'ArmA_VH',
      part: 1,
      cx: 3.1 * u1x - 0.44 * p1x,
      cy: 3.1 * u1y - 0.44 * p1y,
      cz: 0.0,
      rx: 0.48,
      ry: 0.76,
      rz: 0.4,
      rotZ: -armAngle,
      weight: 1.05
    },
    {
      name: 'ArmA_VL',
      part: 1,
      cx: 3.1 * u1x + 0.44 * p1x,
      cy: 3.1 * u1y + 0.44 * p1y,
      cz: 0.0,
      rx: 0.48,
      ry: 0.76,
      rz: 0.4,
      rotZ: -armAngle,
      weight: 1.05
    },

    // CDR Binding Site Tip (Target A apex)
    {
      name: 'ArmA_CDR',
      part: 3,
      cx: 4.15 * u1x,
      cy: 4.15 * u1y,
      cz: 0.0,
      rx: 0.64,
      ry: 0.44,
      rz: 0.38,
      rotZ: -armAngle,
      weight: 0.8
    },

    // ----------------- FAB ARM 2: TARGET B (RIGHT) -----------------
    // Constant Domains (CH1 and CL)
    {
      name: 'ArmB_CH1',
      part: 2,
      cx: 1.7 * u2x - 0.44 * p2x,
      cy: 1.7 * u2y - 0.44 * p2y,
      cz: 0.0,
      rx: 0.48,
      ry: 0.72,
      rz: 0.4,
      rotZ: armAngle,
      weight: 1.0
    },
    {
      name: 'ArmB_CL',
      part: 2,
      cx: 1.7 * u2x + 0.44 * p2x,
      cy: 1.7 * u2y + 0.44 * p2y,
      cz: 0.0,
      rx: 0.48,
      ry: 0.72,
      rz: 0.4,
      rotZ: armAngle,
      weight: 1.0
    },

    // Variable Domains (VH and VL)
    {
      name: 'ArmB_VH',
      part: 2,
      cx: 3.1 * u2x - 0.44 * p2x,
      cy: 3.1 * u2y - 0.44 * p2y,
      cz: 0.0,
      rx: 0.48,
      ry: 0.76,
      rz: 0.4,
      rotZ: armAngle,
      weight: 1.05
    },
    {
      name: 'ArmB_VL',
      part: 2,
      cx: 3.1 * u2x + 0.44 * p2x,
      cy: 3.1 * u2y + 0.44 * p2y,
      cz: 0.0,
      rx: 0.48,
      ry: 0.76,
      rz: 0.4,
      rotZ: armAngle,
      weight: 1.05
    },

    // CDR Binding Site Tip (Target B apex)
    {
      name: 'ArmB_CDR',
      part: 3,
      cx: 4.15 * u2x,
      cy: 4.15 * u2y,
      cz: 0.0,
      rx: 0.64,
      ry: 0.44,
      rz: 0.38,
      rotZ: armAngle,
      weight: 0.8
    }
  ];
}

/**
 * Procedural point generator with honest progress callback
 */
export async function generateAntibodyPointCloud(onProgress) {
  const domains = createDomains();
  const totalWeight = domains.reduce((acc, d) => acc + d.weight, 0);

  // Arrays for 40,000 dots
  const positions = new Float32Array(TOTAL_DOTS * 3);
  const ringPositions = new Float32Array(TOTAL_DOTS * 3);
  const randoms = new Float32Array(TOTAL_DOTS * 3);
  const shades = new Float32Array(TOTAL_DOTS);
  const parts = new Float32Array(TOTAL_DOTS);

  // 3D Voxel Hash Grid for even density (voxel cap = 2)
  const voxelSize = 0.082;
  const voxelCap = 2;
  const voxelCounts = new Map();

  let count = 0;
  const batchSize = 4000;
  const ringRadius = 3.6;

  function samplePointFromDomain(d) {
    // Random point on unit sphere surface with slight depth layer
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const sinPhi = Math.sin(phi);

    // Subtle surface thickness (90% to 100% radius)
    const shellThickness = 0.9 + 0.1 * Math.random();

    let lx = sinPhi * Math.cos(theta) * d.rx * shellThickness;
    let ly = Math.cos(phi) * d.ry * shellThickness;
    let lz = sinPhi * Math.sin(theta) * d.rz * shellThickness;

    // Normal calculation for ridge / thin shading
    const nx = lx / (d.rx * d.rx);
    const ny = ly / (d.ry * d.ry);
    const nz = lz / (d.rz * d.rz);
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
    const normX = nx / nLen;
    const normY = ny / nLen;
    const normZ = nz / nLen;

    // Rotate around Z axis by d.rotZ
    const cosR = Math.cos(d.rotZ);
    const sinR = Math.sin(d.rotZ);
    const rx = lx * cosR - ly * sinR;
    const ry = lx * sinR + ly * cosR;
    const rz = lz;

    const rotNormZ = normZ;

    // World position
    const wx = rx + d.cx;
    const wy = ry + d.cy;
    const wz = rz + d.cz;

    // Shade factor: points on edge/silhouette (normZ closer to 0) get higher glow
    const rimShade = 1.0 - Math.abs(rotNormZ);
    const shade = Math.min(1.0, Math.max(0.1, rimShade * 0.85 + 0.15 * Math.random()));

    return { x: wx, y: wy, z: wz, shade, part: d.part };
  }

  // Pre-calculate cumulative domain distribution
  const cumulativeWeights = [];
  let cum = 0;
  for (const d of domains) {
    cum += d.weight / totalWeight;
    cumulativeWeights.push(cum);
  }

  function pickRandomDomain() {
    const r = Math.random();
    for (let i = 0; i < cumulativeWeights.length; i++) {
      if (r <= cumulativeWeights[i]) return domains[i];
    }
    return domains[domains.length - 1];
  }

  // Generate dots asynchronously in batches to report honest progress
  while (count < TOTAL_DOTS) {
    const targetInBatch = Math.min(TOTAL_DOTS, count + batchSize);

    while (count < targetInBatch) {
      const domain = pickRandomDomain();
      const pt = samplePointFromDomain(domain);

      // Voxel cap check
      const vx = Math.floor(pt.x / voxelSize);
      const vy = Math.floor(pt.y / voxelSize);
      const vz = Math.floor(pt.z / voxelSize);
      const key = `${vx}_${vy}_${vz}`;

      const currVoxelCount = voxelCounts.get(key) || 0;
      if (currVoxelCount >= voxelCap && Math.random() > 0.1) {
        continue; // Reject to maintain even density
      }

      voxelCounts.set(key, currVoxelCount + 1);

      // Target 3D position
      const i3 = count * 3;
      positions[i3] = pt.x;
      positions[i3 + 1] = pt.y;
      positions[i3 + 2] = pt.z;

      // Loader ring position (arranged around a circle in XY plane with slight Z scatter)
      const angle = (count / TOTAL_DOTS) * Math.PI * 2.0 + (Math.random() - 0.5) * 0.05;
      const rJitter = ringRadius + (Math.random() - 0.5) * 0.35;
      ringPositions[i3] = Math.cos(angle) * rJitter;
      ringPositions[i3 + 1] = Math.sin(angle) * rJitter;
      ringPositions[i3 + 2] = (Math.random() - 0.5) * 0.4;

      // aRand: 3 uniform random floats for noise/jitter/phase
      randoms[i3] = Math.random();
      randoms[i3 + 1] = Math.random();
      randoms[i3 + 2] = Math.random();

      // aShade: Ridge/thin surface factor
      shades[count] = pt.shade;

      // aPart: 0=Fc, 1=Arm A, 2=Arm B, 3=CDR tips
      parts[count] = pt.part;

      count++;
    }

    // Call honest progress callback
    if (onProgress) {
      onProgress(count, TOTAL_DOTS);
    }

    // Yield execution to event loop so DOM updates and doesn't block UI
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return {
    count: TOTAL_DOTS,
    positions,
    ringPositions,
    randoms,
    shades,
    parts
  };
}
