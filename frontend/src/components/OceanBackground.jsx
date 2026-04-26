import { useRef, useEffect } from 'react';
import * as THREE from 'three';

// ── Vertex Shader ────────────────────────────────────────────────────────────
// Computes multi-octave waves + analytical normals via finite differences
const vertexShader = /* glsl */`
  uniform float uTime;

  varying float vElevation;
  varying vec3  vNormal_w;    // world-space normal
  varying vec3  vWorldPos;

  float waveH(vec2 p) {
    float w1 = sin(p.x * 0.28 + uTime * 0.55) * cos(p.y * 0.20 + uTime * 0.40) * 0.42;
    float w2 = sin(p.x * 0.65 + p.y * 0.48 + uTime * 0.90) * 0.20;
    float w3 = cos(p.x * 0.44 - p.y * 0.70 + uTime * 0.72) * 0.16;
    float w4 = sin(p.x * 1.80 + p.y * 0.30 + uTime * 1.60) * 0.07;
    float w5 = cos(p.y * 2.20 + p.x * 0.60 + uTime * 1.40) * 0.05;
    float w6 = sin(p.x * 3.80 + p.y * 3.20 + uTime * 2.50) * 0.025;
    return w1 + w2 + w3 + w4 + w5 + w6;
  }

  void main() {
    vec3 pos = position;
    pos.z += waveH(pos.xy);
    vElevation = pos.z;

    // Analytical normal via central finite differences
    float e  = 0.06;
    float dx = waveH(pos.xy + vec2(e, 0.0)) - waveH(pos.xy - vec2(e, 0.0));
    float dy = waveH(pos.xy + vec2(0.0, e)) - waveH(pos.xy - vec2(0.0, e));
    vec3  localNormal = normalize(vec3(-dx / (2.0 * e), -dy / (2.0 * e), 1.0));

    // Transform normal to world space
    vNormal_w = normalize((modelMatrix * vec4(localNormal, 0.0)).xyz);

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// ── Fragment Shader ──────────────────────────────────────────────────────────
// Fresnel + Blinn-Phong specular + sky reflection + caustics + foam
const fragmentShader = /* glsl */`
  uniform float uTime;

  varying float vElevation;
  varying vec3  vNormal_w;
  varying vec3  vWorldPos;

  // cameraPosition is a Three.js built-in uniform

  // Sky colour at a given direction (fake hemisphere)
  vec3 skyColor(vec3 dir) {
    float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3  horizon = vec3(0.28, 0.52, 0.80);
    vec3  zenith  = vec3(0.05, 0.18, 0.52);
    return mix(horizon, zenith, pow(t, 0.6));
  }

  void main() {
    vec3 N = normalize(vNormal_w);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Sun
    vec3 sunDir   = normalize(vec3(0.45, 0.75, 0.50));
    vec3 sunColor = vec3(1.00, 0.96, 0.82);

    // ── Fresnel (Schlick) ────────────────────────────────────────────────────
    float cosTheta = clamp(dot(N, V), 0.0, 1.0);
    float F0       = 0.020;                         // water at normal incidence
    float fresnel  = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
    fresnel        = clamp(fresnel, 0.0, 1.0);

    // ── Specular (Blinn-Phong) ───────────────────────────────────────────────
    vec3  H    = normalize(sunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 512.0);   // tight highlight
    spec       = spec * fresnel * 3.5;

    // ── Sky / environment reflection ─────────────────────────────────────────
    vec3 R       = reflect(-V, N);
    vec3 skyRefl = skyColor(R);

    // ── Water body colour ────────────────────────────────────────────────────
    float t = clamp((vElevation + 2.8) / 5.8, 0.0, 1.0);

    vec3 deep    = vec3(0.01, 0.06, 0.22);
    vec3 mid     = vec3(0.04, 0.20, 0.50);
    vec3 shallow = vec3(0.08, 0.38, 0.68);
    vec3 waterCol = mix(deep, mid, t);
    waterCol      = mix(waterCol, shallow, pow(t, 1.5));

    // ── Foam on crests ───────────────────────────────────────────────────────
    vec3  foamCol = vec3(0.72, 0.88, 0.98);
    float foam    = smoothstep(0.66, 1.0, t);
    waterCol      = mix(waterCol, foamCol, foam * 0.70);

    // ── Caustic shimmer ──────────────────────────────────────────────────────
    float cx = sin(vWorldPos.x * 7.2 + uTime * 4.2) * sin(vWorldPos.z * 6.0 + uTime * 3.5);
    float cy = cos(vWorldPos.x * 5.5 + uTime * 2.8) * cos(vWorldPos.z * 8.1 + uTime * 4.8);
    float caustic = smoothstep(0.60, 1.0, cx * 0.5 + cy * 0.5);
    waterCol += caustic * vec3(0.25, 0.65, 1.00) * 0.13;

    // ── Compose ──────────────────────────────────────────────────────────────
    // Fresnel blends water body with sky reflection
    vec3 col = mix(waterCol, skyRefl, fresnel * 0.72);

    // Add sun glint
    col += sunColor * spec;

    // Subtle subsurface forward scatter at wave valleys
    float scatter = pow(clamp(1.0 - t, 0.0, 1.0), 2.5) * 0.08;
    col += vec3(0.05, 0.40, 0.80) * scatter;

    // Soft distance fade to deep colour at edges
    float distFade = clamp(1.0 - length(vWorldPos.xz) / 65.0, 0.0, 1.0);
    col = mix(deep, col, distFade * 0.65 + 0.35);

    // Transparency: opaque at grazing (high fresnel), translucent overhead
    float alpha = mix(0.80, 0.97, fresnel);

    gl_FragColor = vec4(col, alpha);
  }
`;

export default function OceanBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Water mesh
    const geometry = new THREE.PlaneGeometry(140, 140, 110, 110);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      side: THREE.DoubleSide,
    });

    const ocean = new THREE.Mesh(geometry, material);
    ocean.rotation.x = -Math.PI / 2.3;
    ocean.position.y = 16.5;
    scene.add(ocean);

    // Foam spray particles
    const count = 700;
    const pos   = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 120;
    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const particlesMat = new THREE.PointsMaterial({
      size: 0.16,
      color: 0xaaddff,
      transparent: true,
      opacity: 0.50,
    });
    scene.add(new THREE.Points(particlesGeo, particlesMat));

    camera.position.set(0, 18, 28);
    camera.lookAt(0, 26, 0);

    let animId;
    let localScrollY = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      material.uniforms.uTime.value += 0.06;

      camera.position.y = 18 - localScrollY * 0.01;
      camera.rotation.x = localScrollY * 0.0001;

      renderer.render(scene, camera);
    };

    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    const onScroll = () => { localScrollY = window.scrollY; };

    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });

    // Re-check dimensions after browser finishes initial layout (fixes MacBook refresh bug)
    const initResizeId = setTimeout(onResize, 150);

    return () => {
      clearTimeout(initResizeId);
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      particlesGeo.dispose();
      particlesMat.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -3,
        pointerEvents: 'none',
      }}
    />
  );
}
