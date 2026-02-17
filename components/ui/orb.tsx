import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type AgentState = 'listening' | 'thinking' | 'talking' | null;

interface OrbMeshProps {
  agentState: AgentState;
  colors: [string, string];
  manualInput?: number;
  manualOutput?: number;
}

const vertexShader = `
  uniform float uTime;
  uniform float uDistortion;
  uniform float uSpeed;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  // Simplex-like noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    float noise = snoise(position * 1.5 + uTime * uSpeed);
    float displacement = noise * uDistortion;
    vDisplacement = displacement;
    vec3 newPosition = position + normal * displacement;
    vPosition = newPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform float uOpacity;
  uniform float uFresnelPower;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), uFresnelPower);
    float mixFactor = (vDisplacement + 0.5) * 0.5 + fresnel * 0.5;
    vec3 color = mix(uColor1, uColor2, clamp(mixFactor, 0.0, 1.0));
    color += fresnel * uColor2 * 0.6;
    float glow = fresnel * 0.8;
    color += glow * uColor1;
    gl_FragColor = vec4(color, uOpacity);
  }
`;

function hexToVec3(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}

const OrbMesh: React.FC<OrbMeshProps> = ({ agentState, colors, manualInput = 0, manualOutput = 0 }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetDistortion = useRef(0.08);
  const targetSpeed = useRef(0.15);
  const currentDistortion = useRef(0.08);
  const currentSpeed = useRef(0.15);
  const targetScale = useRef(1);
  const currentScale = useRef(1);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDistortion: { value: 0.08 },
      uSpeed: { value: 0.15 },
      uColor1: { value: hexToVec3(colors[0]) },
      uColor2: { value: hexToVec3(colors[1]) },
      uOpacity: { value: 0.92 },
      uFresnelPower: { value: 2.5 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    uniforms.uColor1.value = hexToVec3(colors[0]);
    uniforms.uColor2.value = hexToVec3(colors[1]);
  }, [colors, uniforms]);

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;

    const audioInfluence = Math.max(manualInput, manualOutput);

    switch (agentState) {
      case 'listening':
        targetDistortion.current = 0.06 + manualInput * 0.25;
        targetSpeed.current = 0.2 + manualInput * 0.3;
        targetScale.current = 1.0 + manualInput * 0.08;
        break;
      case 'thinking':
        targetDistortion.current = 0.15;
        targetSpeed.current = 0.6;
        targetScale.current = 0.95;
        break;
      case 'talking':
        targetDistortion.current = 0.1 + manualOutput * 0.3;
        targetSpeed.current = 0.3 + manualOutput * 0.4;
        targetScale.current = 1.0 + manualOutput * 0.1;
        break;
      default:
        targetDistortion.current = 0.04 + audioInfluence * 0.1;
        targetSpeed.current = 0.1;
        targetScale.current = 1.0;
        break;
    }

    const lerpFactor = 1 - Math.pow(0.05, delta);
    currentDistortion.current += (targetDistortion.current - currentDistortion.current) * lerpFactor;
    currentSpeed.current += (targetSpeed.current - currentSpeed.current) * lerpFactor;
    currentScale.current += (targetScale.current - currentScale.current) * lerpFactor;

    uniforms.uDistortion.value = currentDistortion.current;
    uniforms.uSpeed.value = currentSpeed.current;

    if (meshRef.current) {
      meshRef.current.scale.setScalar(currentScale.current);
      meshRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  );
};

interface OrbProps {
  agentState: AgentState;
  colors?: [string, string];
  className?: string;
  volumeMode?: 'auto' | 'manual';
  manualInput?: number;
  manualOutput?: number;
}

export const Orb: React.FC<OrbProps> = ({
  agentState,
  colors = ['#ff2d78', '#c2185b'],
  className = '',
  volumeMode = 'auto',
  manualInput = 0,
  manualOutput = 0,
}) => {
  const [glReady, setGlReady] = useState(true);

  const inputVal = volumeMode === 'manual' ? manualInput : 0;
  const outputVal = volumeMode === 'manual' ? manualOutput : 0;

  if (!glReady) {
    return (
      <div className={`orb-fallback ${className}`} style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle, var(--accent-warm-dim) 0%, transparent 70%)',
        borderRadius: '50%',
      }}>
        <div style={{
          width: '60%',
          height: '60%',
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, ${colors[0]}, ${colors[1]})`,
          opacity: agentState ? 0.9 : 0.5,
          animation: agentState === 'thinking' ? 'orbPulse 1.5s ease-in-out infinite' : 'none',
        }} />
      </div>
    );
  }

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 0, 3], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
        onError={() => setGlReady(false)}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={0.8} color={colors[0]} />
        <pointLight position={[-3, -3, 2]} intensity={0.4} color={colors[1]} />
        <OrbMesh
          agentState={agentState}
          colors={colors}
          manualInput={inputVal}
          manualOutput={outputVal}
        />
      </Canvas>
    </div>
  );
};

export default Orb;
