'use client';

import React from 'react';

const EXAMPLE_PROMPTS = [
  '按这份 JD 优化我的简历',
  '给简历做一次竞争力体检',
  '把简历翻译成英文版',
  '模拟一场技术面试',
  '从零搭建一份新简历',
  '优化项目经历，突出量化成果',
  '分析简历有哪些硬伤',
  '翻译成日文版本',
  '模拟 HR 行为面试',
];

type WelcomeSuggestionsProps = {
  onPrompt: (text: string) => void;
};

export default function WelcomeSuggestions({ onPrompt }: WelcomeSuggestionsProps) {
  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="mq-mask relative overflow-hidden">
        <div className="mq-track flex">
          {[...EXAMPLE_PROMPTS, ...EXAMPLE_PROMPTS].map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPrompt(p)}
              className="shrink-0 mr-2 text-xs text-neutral-400 bg-neutral-900 hover:bg-neutral-800 hover:text-neutral-200 rounded-full px-3.5 py-2 transition-colors cursor-pointer"
            >
              {p}
            </button>
          ))}
        </div>
        <style jsx>{`
          .mq-track {
            width: max-content;
            animation: mqscroll 45s linear infinite;
          }
          .mq-mask:hover .mq-track {
            animation-play-state: paused;
          }
          /* 45s 的无限横向跑马灯是整个界面里 reduce 场景下最刺激的一处：停掉动画，
             改成可横向滚动，建议本身仍然全部够得到。 */
          @media (prefers-reduced-motion: reduce) {
            .mq-track {
              animation: none;
            }
            .mq-mask {
              overflow-x: auto;
            }
          }
          .mq-mask {
            -webkit-mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent);
            mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent);
          }
          @keyframes mqscroll {
            from {
              transform: translateX(0);
            }
            to {
              transform: translateX(-50%);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
