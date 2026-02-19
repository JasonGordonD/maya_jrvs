import React, { useEffect, useRef } from 'react';

interface OrbProps {
  isSpeaking: boolean;
  isConnected: boolean;
  inputVolume?: number;
  outputVolume?: number;
  size?: number;
  className?: string;
}

const Orb: React.FC<OrbProps> = ({
  isSpeaking,
  isConnected,
  inputVolume = 0,
  outputVolume = 0,
  size = 120,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const baseRadius = size * 0.28;

    const draw = () => {
      phaseRef.current += 0.02;
      ctx.clearRect(0, 0, size, size);

      if (!isConnected) {
        ctx.beginPath();
        ctx.arc(center, center, baseRadius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(107, 107, 128, 0.15)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(center, center, baseRadius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(107, 107, 128, 0.25)';
        ctx.fill();

        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      const volume = isSpeaking ? outputVolume : inputVolume;
      const scaledVolume = Math.min(1, volume * 2.5);
      const pulseAmount = scaledVolume * baseRadius * 0.35;
      const breathe = Math.sin(phaseRef.current) * baseRadius * 0.04;

      const outerGlow = baseRadius + pulseAmount + breathe + baseRadius * 0.4;
      const gradient = ctx.createRadialGradient(
        center, center, baseRadius * 0.3,
        center, center, outerGlow
      );

      if (isSpeaking) {
        gradient.addColorStop(0, `rgba(255, 45, 120, ${0.35 + scaledVolume * 0.3})`);
        gradient.addColorStop(0.5, `rgba(255, 45, 120, ${0.12 + scaledVolume * 0.15})`);
        gradient.addColorStop(1, 'rgba(255, 45, 120, 0)');
      } else {
        gradient.addColorStop(0, `rgba(255, 45, 120, ${0.2 + scaledVolume * 0.2})`);
        gradient.addColorStop(0.5, `rgba(255, 45, 120, ${0.06 + scaledVolume * 0.08})`);
        gradient.addColorStop(1, 'rgba(255, 45, 120, 0)');
      }

      ctx.beginPath();
      ctx.arc(center, center, outerGlow, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      const numPoints = 64;
      const wobbleRadius = baseRadius + pulseAmount + breathe;

      ctx.beginPath();
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const wobble = Math.sin(angle * 3 + phaseRef.current * 2) * scaledVolume * baseRadius * 0.12
          + Math.sin(angle * 5 - phaseRef.current * 1.3) * scaledVolume * baseRadius * 0.06;
        const r = wobbleRadius + wobble;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const fillGrad = ctx.createRadialGradient(
        center - baseRadius * 0.2, center - baseRadius * 0.2, 0,
        center, center, wobbleRadius
      );
      fillGrad.addColorStop(0, isSpeaking ? 'rgba(255, 80, 140, 0.5)' : 'rgba(255, 45, 120, 0.35)');
      fillGrad.addColorStop(1, isSpeaking ? 'rgba(255, 45, 120, 0.2)' : 'rgba(255, 45, 120, 0.1)');
      ctx.fillStyle = fillGrad;
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 45, 120, ${0.4 + scaledVolume * 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const innerRadius = baseRadius * 0.45 + scaledVolume * baseRadius * 0.1;
      ctx.beginPath();
      ctx.arc(center, center, innerRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 45, 120, ${0.3 + scaledVolume * 0.3})`;
      ctx.fill();

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [isSpeaking, isConnected, inputVolume, outputVolume, size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size }}
    />
  );
};

export default Orb;
