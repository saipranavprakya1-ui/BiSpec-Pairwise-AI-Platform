import * as THREE from 'three';

/**
 * targetCells.js
 * Procedural WebGL point-cloud clusters representing:
 * 1. Target A Cell (Tumor cell with surface antigen spikes in --color-a)
 * 2. Target B Cell (Immune effector receptor cluster in --color-b)
 * 3. Cytolytic synapse shockwave & tumor cell termination particles
 *
 * Controlled seamlessly by scroll progress from top of the page down to Mechanism Viz:
 * - Scroll 0.00 - 0.35: Inactive (hidden)
 * - Scroll 0.35 - 0.60: Fading in and emerging from the microenvironment
 * - Scroll 0.60 - 0.78: Approaching the bispecific antibody
 * - Scroll 0.78 - 0.88: Dual docking and bridging (cells drawn together)
 * - Scroll 0.88 - 1.00: Cytolytic synapse firing & tumor cell dissolution (termination!)
 */

export class TargetCellsManager {
  constructor(scene, colors) {
    this.scene = scene;
    this.colors = colors;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.tumorDotCount = 3600;
    this.effectorDotCount = 2400;

    this.initTumorCell();
    this.initEffectorCell();
    this.initSynapseWave();
  }

  initTumorCell() {
    const count = this.tumorDotCount;
    const positions = new Float32Array(count * 3);
    const origPositions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const baseColor = this.colors.dots;
    const antigenColor = this.colors.colorA;

    for (let i = 0; i < count; i++) {
      // Golden spiral distribution on sphere
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);

      // Random radius between 0.8 and 1.3
      const isAntigen = Math.random() < 0.28 && Math.cos(theta) > -0.2; // Antigen spikes facing right (towards antibody)
      const r = isAntigen ? 1.35 + Math.random() * 0.35 : 0.85 + Math.random() * 0.3;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      origPositions[i * 3] = x;
      origPositions[i * 3 + 1] = y;
      origPositions[i * 3 + 2] = z;

      // Radial velocity for dissolution / termination
      const vLen = 1.8 + Math.random() * 2.2;
      velocities[i * 3] = (x / r) * vLen + (Math.random() - 0.5) * 0.5;
      velocities[i * 3 + 1] = (y / r) * vLen + (Math.random() - 0.5) * 0.5;
      velocities[i * 3 + 2] = (z / r) * vLen + (Math.random() - 0.5) * 0.5;

      // Color: antigen spikes in colorA, body in muted dots
      if (isAntigen) {
        colors[i * 3] = antigenColor.x;
        colors[i * 3 + 1] = antigenColor.y;
        colors[i * 3 + 2] = antigenColor.z;
        sizes[i] = 22.0 + Math.random() * 10.0;
      } else {
        colors[i * 3] = baseColor.x * 0.7;
        colors[i * 3 + 1] = baseColor.y * 0.7;
        colors[i * 3 + 2] = baseColor.z * 0.7;
        sizes[i] = 14.0 + Math.random() * 6.0;
      }
    }

    this.tumorGeo = new THREE.BufferGeometry();
    this.tumorGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.tumorGeo.setAttribute('origPosition', new THREE.BufferAttribute(origPositions, 3));
    this.tumorGeo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    this.tumorGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.tumorGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Custom Canvas Circle Texture
    const particleTex = this.createCircleTexture();

    this.tumorMat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      map: particleTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.tumorPoints = new THREE.Points(this.tumorGeo, this.tumorMat);
    this.tumorPoints.position.set(-3.2, 0.4, 0);
    this.group.add(this.tumorPoints);
  }

  initEffectorCell() {
    const count = this.effectorDotCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const baseColor = this.colors.dots;
    const receptorColor = this.colors.colorB;

    for (let i = 0; i < count; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);

      const isReceptor = Math.random() < 0.32 && Math.cos(theta) < 0.2; // Receptors facing left (towards antibody)
      const r = isReceptor ? 1.25 + Math.random() * 0.3 : 0.8 + Math.random() * 0.25;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      if (isReceptor) {
        colors[i * 3] = receptorColor.x;
        colors[i * 3 + 1] = receptorColor.y;
        colors[i * 3 + 2] = receptorColor.z;
      } else {
        colors[i * 3] = baseColor.x * 0.6;
        colors[i * 3 + 1] = baseColor.y * 0.6;
        colors[i * 3 + 2] = baseColor.z * 0.6;
      }
    }

    this.effectorGeo = new THREE.BufferGeometry();
    this.effectorGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.effectorGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleTex = this.createCircleTexture();

    this.effectorMat = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      map: particleTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.effectorPoints = new THREE.Points(this.effectorGeo, this.effectorMat);
    this.effectorPoints.position.set(3.2, 0.4, 0);
    this.group.add(this.effectorPoints);
  }

  initSynapseWave() {
    // Ring of glowing dots representing the cytolytic synapse shockwave
    const count = 360;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle);
      positions[i * 3 + 1] = Math.sin(angle);
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.22,
      color: 0x5fd0c4,
      map: this.createCircleTexture(),
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.synapseWave = new THREE.Points(geo, mat);
    this.synapseWave.position.set(-1.2, 0.4, 0);
    this.group.add(this.synapseWave);
  }

  createCircleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.3, 'rgba(234, 240, 242, 0.8)');
    grad.addColorStop(0.7, 'rgba(183, 203, 209, 0.3)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  /**
   * Updates state based on scrollProgress (0.0 to 1.0)
   */
  update(scrollProgress, elapsedTime) {
    if (scrollProgress < 0.20) {
      // Hero top: completely hidden
      this.tumorMat.opacity = 0.0;
      this.effectorMat.opacity = 0.0;
      this.synapseWave.material.opacity = 0.0;
      this.resetTumorPositions();
      return;
    }

    // Phase 1: Fade in during Problem -> Mechanism (0.20 -> 0.55)
    if (scrollProgress >= 0.20 && scrollProgress < 0.55) {
      const t = (scrollProgress - 0.20) / 0.35;
      const ease = t * t * (3 - 2 * t);
      this.tumorMat.opacity = ease * 0.75;
      this.effectorMat.opacity = ease * 0.75;
      this.tumorPoints.position.set(-3.2, 0.4, 0);
      this.effectorPoints.position.set(3.2, 0.4, 0);
      this.synapseWave.material.opacity = 0.0;
      this.resetTumorPositions();
    }

    // Phase 2: Mechanism Step 1 & 2: Approaching (0.55 -> 0.75)
    else if (scrollProgress >= 0.55 && scrollProgress < 0.75) {
      const t = (scrollProgress - 0.55) / 0.20;
      this.tumorMat.opacity = 0.85;
      this.effectorMat.opacity = 0.85;

      // Cells position themselves to receive antibody arms
      const tumorX = THREE.MathUtils.lerp(-3.2, -2.5, t);
      const effectorX = THREE.MathUtils.lerp(3.2, 2.5, t);
      this.tumorPoints.position.set(tumorX, 0.4, 0);
      this.effectorPoints.position.set(effectorX, 0.4, 0);
      this.synapseWave.material.opacity = 0.0;
      this.resetTumorPositions();
    }

    // Phase 3: Mechanism Step 3: Docking & Bridging (0.75 -> 0.88)
    else if (scrollProgress >= 0.75 && scrollProgress < 0.88) {
      const t = (scrollProgress - 0.75) / 0.13;
      this.tumorMat.opacity = 0.95;
      this.effectorMat.opacity = 0.95;

      // Bridging: cells drawn together toward antibody arms
      const tumorX = THREE.MathUtils.lerp(-2.5, -2.0, t);
      const effectorX = THREE.MathUtils.lerp(2.5, 2.0, t);
      this.tumorPoints.position.set(tumorX, 0.4, 0);
      this.effectorPoints.position.set(effectorX, 0.4, 0);

      // Pulse at contact junction
      const pulse = (Math.sin(elapsedTime * 6.0) + 1.0) * 0.5;
      this.synapseWave.position.set(tumorX + 0.6, 0.4, 0);
      this.synapseWave.scale.set(0.6 + pulse * 0.3, 0.6 + pulse * 0.3, 0.6 + pulse * 0.3);
      this.synapseWave.material.opacity = pulse * 0.5;
      this.resetTumorPositions();
    }

    // Phase 4: Mechanism Step 4: Cytolytic Synapse & Tumor Cell Termination (0.88 -> 1.00)
    else if (scrollProgress >= 0.88) {
      const t = Math.min(1.0, (scrollProgress - 0.88) / 0.12);
      this.effectorMat.opacity = 0.95;
      this.effectorPoints.position.set(2.0, 0.4, 0);

      // Expanding cytolytic shockwave
      const waveScale = 1.0 + t * 4.5;
      this.synapseWave.position.set(-1.4, 0.4, 0);
      this.synapseWave.scale.set(waveScale, waveScale, waveScale);
      this.synapseWave.material.opacity = Math.max(0.0, (1.0 - t * 0.9) * 0.9);

      // Disintegration & dissolution of tumor cell dots (cell lysis / apoptosis!)
      const posAttr = this.tumorGeo.getAttribute('position');
      const origAttr = this.tumorGeo.getAttribute('origPosition');
      const velAttr = this.tumorGeo.getAttribute('velocity');

      const count = posAttr.count;
      for (let i = 0; i < count; i++) {
        const ox = origAttr.getX(i);
        const oy = origAttr.getY(i);
        const oz = origAttr.getZ(i);

        const vx = velAttr.getX(i);
        const vy = velAttr.getY(i);
        const vz = velAttr.getZ(i);

        // Scatter outward with turbulence
        const explodeT = t * 1.8;
        const curX = ox + vx * explodeT;
        const curY = oy + vy * explodeT + Math.sin(elapsedTime * 2.0 + i) * 0.1 * explodeT;
        const curZ = oz + vz * explodeT;

        posAttr.setXYZ(i, curX, curY, curZ);
      }
      posAttr.needsUpdate = true;

      // Tumor cell opacity fades as it terminates
      this.tumorMat.opacity = Math.max(0.08, 0.95 * (1.0 - t * 0.85));
    }

    // Subtle gentle cell rotation
    this.tumorPoints.rotation.y = elapsedTime * 0.15;
    this.effectorPoints.rotation.y = -elapsedTime * 0.12;
  }

  resetTumorPositions() {
    const posAttr = this.tumorGeo.getAttribute('position');
    const origAttr = this.tumorGeo.getAttribute('origPosition');
    if (!posAttr || !origAttr) return;

    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setXYZ(i, origAttr.getX(i), origAttr.getY(i), origAttr.getZ(i));
    }
    posAttr.needsUpdate = true;
  }

  dispose() {
    if (this.tumorGeo) this.tumorGeo.dispose();
    if (this.tumorMat) this.tumorMat.dispose();
    if (this.effectorGeo) this.effectorGeo.dispose();
    if (this.effectorMat) this.effectorMat.dispose();
    if (this.synapseWave && this.synapseWave.geometry) this.synapseWave.geometry.dispose();
    if (this.synapseWave && this.synapseWave.material) this.synapseWave.material.dispose();
    if (this.group && this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
