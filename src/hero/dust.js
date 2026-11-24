import * as THREE from 'three';

/**
 * Ambient floating dust motes
 */
export class AmbientDust {
  constructor(scene) {
    this.scene = scene;
    this.count = 260;
    this.isReducedMotion = false;

    const positions = new Float32Array(this.count * 3);
    this.velocities = [];

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 16.0;
      positions[i3 + 1] = (Math.random() - 0.5) * 12.0;
      positions[i3 + 2] = (Math.random() - 0.5) * 8.0;

      this.velocities.push({
        vx: (Math.random() - 0.5) * 0.003,
        vy: 0.002 + Math.random() * 0.004,
        vz: (Math.random() - 0.5) * 0.002,
        phase: Math.random() * Math.PI * 2
      });
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Custom disc texture
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(183, 203, 209, 0.85)');
    grad.addColorStop(0.5, 'rgba(183, 203, 209, 0.25)');
    grad.addColorStop(1, 'rgba(183, 203, 209, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    this.texture = new THREE.CanvasTexture(canvas);

    this.material = new THREE.PointsMaterial({
      size: 0.12,
      map: this.texture,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
  }

  update(time) {
    if (this.isReducedMotion) return;

    const pos = this.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const v = this.velocities[i];

      pos[i3] += v.vx + Math.sin(time * 0.5 + v.phase) * 0.001;
      pos[i3 + 1] += v.vy;
      pos[i3 + 2] += v.vz;

      // Wrap around bounding box
      if (pos[i3 + 1] > 6.0) pos[i3 + 1] = -6.0;
      if (pos[i3] > 8.0) pos[i3] = -8.0;
      if (pos[i3] < -8.0) pos[i3] = 8.0;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  setReducedMotion(reduced) {
    this.isReducedMotion = reduced;
  }

  dispose() {
    if (this.points && this.scene) {
      this.scene.remove(this.points);
    }
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.texture) this.texture.dispose();
  }
}
