'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 球下方那块文字。
 *
 * ## 为什么是固定高度、且脱离文档流
 *
 * 这里原来是流内的 `shrink-0`，而球被 `flex-1` 的剩余空间居中——**字幕每多一行，
 * 球就上移约 11px**。抖动是布局问题，不是动画问题，加多少缓动都治不了。
 *
 * 现在槽位高度写死 3 行、绝对定位，内容**底对齐**：1 行变 3 行时向上生长，下沿不动，
 * 球和输入框都碰不到。
 *
 * ## 为什么贴着输入框
 *
 * 参照 ChatGPT 语音模式实测：状态文字距输入框 36px、距球 144px——它在视觉上属于
 * **输入区**，于是上方那片黑就成了球的呼吸空间。悬在球与输入框正中间的文字谁都不属于，
 * 那才是「孔隙太大」的真正来源（空隙比例其实两边几乎一样）。
 *
 * ## 超出 3 行怎么办
 *
 * 顶部淡出，不截断也不加省略号。完整内容点球看逐字稿——字幕是「没听清瞟一眼」的兜底，
 * 不是让人读完的正文。
 */

/** 槽位高度：3 行 × `leading-relaxed`（1.625）× 14px ≈ 68px。 */
const SLOT_HEIGHT = 68;

export type CaptionTone = 'interviewer' | 'mine' | 'error';

export default function CaptionSlot({
  text,
  tone,
  shimmer,
}: {
  text: string | null;
  tone: CaptionTone;
  /** 加载态的流光。见 {@link ShimmerText}。 */
  shimmer?: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // 遮罩**只在真的超出 3 行时**才加。此前它是无条件的，而淡出区 24px 比一行还高
  // （14px × 1.625 ≈ 22.75px）——于是任何一条字幕的第一行都被吃掉，看起来像被挡住了。
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    setClipped(!!el && el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  const mask = clipped
    ? 'linear-gradient(to bottom, transparent 0, black 24px)'
    : undefined;

  return (
    <div
      // 贴着输入框：36px 是从 ChatGPT 量来的距离。
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-center px-8 pb-[36px]"
      style={{ height: SLOT_HEIGHT + 36 }}
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {text && (
          <motion.div
            ref={bodyRef}
            // key 里不带 text：字幕是逐字长出来的，带上 text 会让每多一个字就整块
            // 重挂一次（淡出淡入 + 位移），读起来是一句话在原地闪。只有换人说才重挂。
            key={tone}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{
              maxHeight: SLOT_HEIGHT,
              // 超出部分顶部淡出。用遮罩而不是截断，读起来是「上面还有」，
              // 而不是「这句话没写完」。
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
            className={`max-w-2xl overflow-hidden text-center text-[14px] leading-relaxed ${
              tone === 'error'
                ? 'text-rev-del'
                : tone === 'mine'
                  ? 'text-muted'
                  : 'text-secondary'
            }`}
          >
            {shimmer ? <ShimmerText text={text} /> : text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 一道光扫过整句要多久。 */
const SWEEP_SECONDS = 1.5;
/** 两道之间歇多久。不歇的话像跑马灯，歇一下才有「还在等」的呼吸感。 */
const SWEEP_PAUSE = 0.7;
/** 静息亮度。整句在这个亮度上，高光扫到才升到 1。 */
const DIM = 0.4;

/**
 * 逐字亮度波——加载文字上那道扫过去的高光。
 *
 * **不用 `background-clip: text` + 渐变**：那是明令禁止的渐变文字。改成按字符错相位地
 * 调透明度，视觉结果一样。对中文反而更贴合：**汉字是等宽的天然单位**，而渐变扫光按
 * 像素推进，中英混排时会因字宽不均而顿挫。
 */
function ShimmerText({ text }: { text: string }) {
  const chars = [...text];
  const total = chars.length || 1;
  return (
    <>
      {chars.map((char, index) => {
        // 空白不参与：跟着闪只会让词间距看起来在抖。
        if (!char.trim()) {
          return (
            <span key={index} style={{ opacity: DIM }}>
              {char}
            </span>
          );
        }
        return (
          <motion.span
            key={index}
            // 亮的窗口只占一个周期的 ~16%，所以任一时刻只有一小段是亮的——
            // 若像 `[dim, 1, dim]` 那样亮满半个周期，读出来是整句一起明暗，不是一道光。
            animate={{ opacity: [DIM, DIM, 1, DIM, DIM] }}
            transition={{
              duration: SWEEP_SECONDS,
              times: [0, 0.42, 0.5, 0.58, 1],
              repeat: Infinity,
              repeatDelay: SWEEP_PAUSE,
              ease: 'easeInOut',
              // 相位沿字符线性推移 = 亮带从左扫到右。用**正**延迟：framer-motion 的
              // 负 delay 不保证会 seek 进动画中段，而正延迟在第一遍之后同样得到
              // 稳定的行进波（第一遍看起来就是光从左边扫进来，正好）。
              delay: (index / total) * SWEEP_SECONDS,
            }}
          >
            {char}
          </motion.span>
        );
      })}
    </>
  );
}
