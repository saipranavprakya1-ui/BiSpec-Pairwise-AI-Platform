/**
 * Point-Cloud Shaders for BiSpec Hero
 * - Arm A dots tinted toward --color-a (0.35 mix)
 * - Arm B dots tinted toward --color-b (0.35 mix)
 * - Fc stays --color-dots
 * - 4.2s pulse running along arms with bright CDR tips flash
 * - Cursor light proximity boost
 * - One-time shine sweep
 * - Particle perspective size attenuation & smooth circular disc
 */

export const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uShineProgress;
  uniform vec3 uCursorPos;
  uniform float uPixelRatio;
  uniform float uBaseSize;
  uniform float uBreathingIntensity;

  attribute vec3 aRingPos;
  attribute vec3 aRand;
  attribute float aShade;
  attribute float aPart;

  varying float vPart;
  varying float vShade;
  varying float vLightDist;
  varying float vGlint;
  varying float vShine;
  varying vec3 vPos;

  void main() {
    vPart = aPart;
    vShade = aShade;

    // Assemble-from-ring interpolation with per-dot random stagger
    float staggered = clamp((uProgress - aRand.x * 0.25) / 0.75, 0.0, 1.0);
    float ease = smoothstep(0.0, 1.0, staggered);
    vec3 currentPos = mix(aRingPos, position, ease);

    // Subtle breathing oscillation
    float breathe = sin(uTime * 1.5 + aRand.y * 6.28318) * 0.02 * uBreathingIntensity;
    currentPos.y += breathe;
    currentPos.x += currentPos.x * breathe * 0.25;

    vPos = currentPos;

    // 4.2-second Binding-Site Glint cycle
    float cycle = mod(uTime, 4.2);
    
    // Wave traveling along arms upward (from Y=0.2 to Y=4.2 over first 2.6s)
    float pulseY = mix(0.1, 4.2, clamp(cycle / 2.6, 0.0, 1.0));
    float armDist = abs(position.y - pulseY);
    float armPulse = exp(-armDist * armDist * 6.0) * smoothstep(0.0, 0.2, cycle) * (1.0 - smoothstep(2.4, 2.7, cycle));
    
    // Flash at CDR tips (aPart == 3.0) between 2.6s and 3.8s
    float tipPhase = clamp((cycle - 2.5) / 1.2, 0.0, 1.0);
    float tipFlash = sin(tipPhase * 3.14159265) * 2.2;
    if (aPart != 3.0) {
      tipFlash = 0.0;
    }

    // Combine pulse effects
    if (aPart == 1.0 || aPart == 2.0) {
      vGlint = armPulse * 0.85;
    } else if (aPart == 3.0) {
      vGlint = tipFlash + armPulse * 0.5;
    } else {
      vGlint = 0.0;
    }

    // One-time shine sweep along Y axis
    float shineDist = abs(currentPos.y - uShineProgress);
    vShine = exp(-shineDist * shineDist * 3.5) * 1.6;

    // Proximity to cursor light
    vLightDist = length(currentPos - uCursorPos);

    // Camera view projection
    vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Perspective point size attenuation
    float pSize = (uBaseSize * (0.8 + 0.4 * aRand.z)) * uPixelRatio / (-mvPosition.z);
    gl_PointSize = clamp(pSize, 2.0, 48.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform vec3 uColorDots;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  varying float vPart;
  varying float vShade;
  varying float vLightDist;
  varying float vGlint;
  varying float vShine;
  varying vec3 vPos;

  void main() {
    // Render as a circular disc with smooth edge falloff
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;

    float alpha = smoothstep(0.5, 0.08, dist);
    float core = smoothstep(0.18, 0.0, dist);

    // Base color from tokens
    vec3 col = uColorDots;

    // Domain tinting:
    // aPart 0 = Fc (stays --color-dots)
    // aPart 1 = Fab arm A (mix 0.35 with --color-a)
    // aPart 2 = Fab arm B (mix 0.35 with --color-b)
    // aPart 3 = CDR tips (tinted toward corresponding arm with higher luminescence)
    if (vPart == 1.0) {
      col = mix(col, uColorA, 0.35);
    } else if (vPart == 2.0) {
      col = mix(col, uColorB, 0.35);
    } else if (vPart == 3.0) {
      vec3 tipColor = vPos.x < 0.0 ? uColorA : uColorB;
      col = mix(col, tipColor, 0.65);
    }

    // Apply ridge / surface thinness shading
    col *= (0.68 + 0.52 * vShade);

    // Cursor light boost
    float cursorLight = 1.0 / (1.0 + vLightDist * vLightDist * 0.12);
    col += mix(vec3(0.05), col, 0.45) * cursorLight * 1.35;

    // Shine sweep illumination
    col += vec3(0.35, 0.42, 0.5) * vShine;

    // Binding-site glint pulse
    if (vGlint > 0.01) {
      vec3 glintColor = (vPart == 3.0) ? (vPos.x < 0.0 ? uColorA : uColorB) : mix(col, vec3(1.0), 0.4);
      col += glintColor * vGlint;
    }

    // Center hot core
    col += vec3(0.18) * core;

    gl_FragColor = vec4(col, alpha * 0.94);
  }
`;
