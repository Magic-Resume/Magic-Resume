import React from 'react';
import { cn } from '@/lib/utils';
import { MaskIcon } from '@/components/icons/MaskIcon';

/** All artwork lives in public/marks (house rule: no inline <svg> in components).
 *  Static marks render through MaskIcon so `currentColor` keeps working; the
 *  animated hero star ships its keyframes inside the .svg file itself, which
 *  browsers run even when the file is loaded via <img>. */
const MARKS = {
  star: '/marks/polaris-star.svg',
  polaris: '/marks/polaris.svg',
  flask: '/marks/lab-flask.svg',
  pet: '/marks/polaris-pet.svg',
  petJump: '/marks/polaris-pet-jump.svg',
  petSit: '/marks/polaris-pet-sit.svg',
} as const;

export function PolarisGlyph({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return <MaskIcon src={MARKS.star} size={size} className={className} />;
}

/**
 * Polaris — the lab's guiding-star mark (北极星). A four-pointed north star with
 * a faint twinkle, replacing the old generic robot face. Inherits color from
 * `currentColor`, so the caller's text color drives it; pair with the sky accent.
 * This static variant is used where motion would distract (e.g. the rail).
 */
export default function PolarisMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return <MaskIcon src={MARKS.polaris} size={size} className={className} />;
}

/**
 * LabMark — the AI-lab header glyph, hand-drawn to replace the generic lucide
 * flask: an Erlenmeyer silhouette holding the Polaris star, with a twinkle
 * escaping past the neck. Same star geometry as the brand mark (scaled), so the
 * header and the chat avatar read as one identity. Inherits `currentColor`.
 */
export function LabMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return <MaskIcon src={MARKS.flask} size={size} className={className} />;
}

/**
 * The hero avatar — the pixel pet「小北极星」standing free on the canvas (no
 * plate, no frame), only a soft pulsing glow behind it. The pet's own motion
 * (two-frame hop / blink / antenna-star twinkle, steps() timing) ships inside
 * polaris-pet.svg, which carries its own reduced-motion query.
 */
export function PolarisAvatar({
  className,
  size = 56,
  pose = 'default',
}: {
  className?: string;
  /** 欢迎态 56，落到输入框上的工位 28——同一只宠物，只是远近不同。 */
  size?: number;
  /** `jump` = 腾空帧（飞行途中）；`sit` = 坐姿帧（落在输入框上沿时）。 */
  pose?: 'default' | 'jump' | 'sit';
}) {
  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      {/* ambient glow — slow pulse behind the pet */}
      <div className="polaris-glow absolute inset-0 rounded-full bg-sky-500/25 blur-xl" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pose === 'jump' ? MARKS.petJump : pose === 'sit' ? MARKS.petSit : MARKS.pet} width={size} height={size} alt="" aria-hidden="true" className="relative" />
      <style jsx>{`
        /* 全局心跳的整数倍（两拍一次），而不是另取一个 4s：同屏的呼吸元素周期互质
           时，明暗会缓慢错开又对齐，看久了像在飘。 */
        .polaris-glow {
          animation: polarisGlow calc(var(--breath-duration, 2.4s) * 2) var(--breath-ease, ease-in-out) infinite;
        }
        @keyframes polarisGlow {
          0%,
          100% {
            opacity: 0.45;
          }
          50% {
            opacity: 0.85;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .polaris-glow {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
