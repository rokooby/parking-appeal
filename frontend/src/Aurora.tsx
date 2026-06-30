import { useEffect, useRef } from "react";

// Hand rolled canvas 2D aurora / gradient mesh.
// Draws a visible first frame immediately, animates with requestAnimationFrame,
// resizes via ResizeObserver, cancels on cleanup, and respects reduced motion.

interface Blob {
  hue: number;
  sat: number;
  light: number;
  baseX: number;
  baseY: number;
  ampX: number;
  ampY: number;
  radius: number;
  speed: number;
  phase: number;
}

// Catppuccin palette blobs: lavender, sky, green, peach, rose.
const BLOBS: Blob[] = [
  { hue: 267, sat: 84, light: 81, baseX: 0.22, baseY: 0.32, ampX: 0.10, ampY: 0.12, radius: 0.58, speed: 0.18, phase: 0.0 },
  { hue: 189, sat: 71, light: 73, baseX: 0.74, baseY: 0.28, ampX: 0.12, ampY: 0.10, radius: 0.54, speed: 0.22, phase: 1.7 },
  { hue: 115, sat: 54, light: 76, baseX: 0.52, baseY: 0.66, ampX: 0.14, ampY: 0.11, radius: 0.60, speed: 0.15, phase: 3.1 },
  { hue: 23, sat: 92, light: 75, baseX: 0.84, baseY: 0.74, ampX: 0.10, ampY: 0.13, radius: 0.44, speed: 0.26, phase: 4.4 },
  { hue: 267, sat: 84, light: 81, baseX: 0.12, baseY: 0.80, ampX: 0.11, ampY: 0.09, radius: 0.42, speed: 0.20, phase: 5.5 },
];

export function Aurora({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let raf = 0;

    function resize() {
      const parent = canvas!.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : { width: 1440, height: 900 };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = width + "px";
      canvas!.style.height = height + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(t: number) {
      const time = t * 0.001;
      // Deep base wash.
      ctx!.globalCompositeOperation = "source-over";
      const base = ctx!.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, "#181825");
      base.addColorStop(1, "#11111b");
      ctx!.fillStyle = base;
      ctx!.fillRect(0, 0, width, height);

      // Additive colorful blobs.
      ctx!.globalCompositeOperation = "lighter";
      for (const b of BLOBS) {
        const cx = (b.baseX + Math.cos(time * b.speed + b.phase) * b.ampX) * width;
        const cy = (b.baseY + Math.sin(time * b.speed * 1.2 + b.phase) * b.ampY) * height;
        const r = b.radius * Math.min(width, height);
        const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `hsla(${b.hue}, ${b.sat}%, ${b.light}%, 0.55)`);
        g.addColorStop(0.45, `hsla(${b.hue}, ${b.sat}%, ${b.light}%, 0.22)`);
        g.addColorStop(1, `hsla(${b.hue}, ${b.sat}%, ${b.light}%, 0)`);
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Fine grain scanline veil for a futuristic feel.
      ctx!.globalCompositeOperation = "source-over";
      ctx!.fillStyle = "rgba(24, 24, 37, 0.10)";
      for (let y = 0; y < height; y += 3) {
        ctx!.fillRect(0, y, width, 1);
      }
    }

    resize();
    draw(0); // visible first frame

    if (!reduced) {
      const loop = (t: number) => {
        draw(t);
        raf = window.requestAnimationFrame(loop);
      };
      raf = window.requestAnimationFrame(loop);
    }

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        resize();
        if (reduced) draw(0);
      });
      if (canvas.parentElement) ro.observe(canvas.parentElement);
    }

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
