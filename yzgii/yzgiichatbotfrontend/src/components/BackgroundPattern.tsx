import React, { useMemo } from 'react';
import {
  Utensils,
  UtensilsCrossed,
  ChefHat,
  Coffee,
  CupSoda,
  Croissant,
  Pizza,
  CakeSlice
} from 'lucide-react';

import { BackgroundMode } from '../theme';

const icons = [Utensils, UtensilsCrossed, ChefHat, Coffee, CupSoda, Croissant, Pizza, CakeSlice];

/** Deterministic pseudo-random in [0, 1) — iki katman aynı düzeni kullanır */
function rng01(i: number, j: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + j * 78.233 + salt) * 43758.5453;
  return x - Math.floor(x);
}

interface BackgroundPatternProps {
  mode?: BackgroundMode;
}

const BackgroundPattern: React.FC<BackgroundPatternProps> = ({ mode = 'subtle' }) => {
  const layers = useMemo(() => {
    if (mode === 'none') return null;

    const rows = mode === 'dense' ? 12 : 8;
    const cols = mode === 'dense' ? 13 : 9;
    const opacity = mode === 'dense' ? 0.13 : 0.11;

    const cells: {
      i: number;
      j: number;
      Icon: (typeof icons)[number];
      top: string;
      left: string;
      rotation: number;
      scale: number;
    }[] = [];

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const r0 = rng01(i, j, 0);
        const r1 = rng01(i, j, 1);
        const r2 = rng01(i, j, 2);
        const r3 = rng01(i, j, 3);

        const topBase = rows <= 1 ? 50 : 3 + (i / (rows - 1)) * 94;
        const leftBase = cols <= 1 ? 50 : 2 + (j / (cols - 1)) * 96;

        cells.push({
          i,
          j,
          Icon: icons[Math.floor(r0 * icons.length) % icons.length],
          top: `${topBase + (r1 * 6 - 3)}%`,
          left: `${leftBase + (r2 * 6 - 3)}%`,
          rotation: r3 * 360,
          scale: 0.55 + r3 * 0.85
        });
      }
    }

    const toNodes = (prefix: string) =>
      cells.map(({ i, j, Icon, top, left, rotation, scale }) => (
        <div
          key={`${prefix}-${i}-${j}`}
          style={{
            position: 'absolute',
            top,
            left,
            transform: `rotate(${rotation}deg) scale(${scale})`,
            opacity,
            color: 'color-mix(in srgb, var(--primary-color) 28%, var(--text-main))',
            filter: 'blur(0.35px)'
          }}
        >
          <Icon size={32} />
        </div>
      ));

    return [toNodes('a'), toNodes('b')];
  }, [mode]);

  const show = mode !== 'none';

  return (
    <div
      className={`bg-pattern-mount${mode === 'none' ? ' bg-pattern-mount--hidden' : ''}`}
      aria-hidden={true}
      style={{ pointerEvents: 'none', zIndex: 0 }}
    >
      {show && (
        <div className="falling-bg">
          <div className="pattern-layer">{layers?.[0]}</div>
          <div className="pattern-layer">{layers?.[1]}</div>
        </div>
      )}
    </div>
  );
};

export default BackgroundPattern;
