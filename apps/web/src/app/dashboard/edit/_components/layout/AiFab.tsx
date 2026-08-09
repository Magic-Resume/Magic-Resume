"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type AiFabProps = {
  onClick: () => void;
  isRunning?: boolean;
};

// 桌宠的三个姿态帧:静息(多重微动作) / hover 雀跃(注意到你了) / 生成中专注思考。
// AI 的状态 = 桌宠的神态,和聊天头像(ChatThread)同一套语言。动画都烘在各自 svg 内。
const PET_IDLE = "/marks/polaris-pet.svg";
const PET_EXCITED = "/marks/polaris-pet-excited.svg";
const PET_THINKING = "/marks/polaris-pet-thinking.svg";

/**
 * AI Lab 里才会用到、但要在这儿就预热的几张。
 *
 * 最要紧的是 `polaris-pet-jump.svg`:它只在「欢迎态 → 输入框工位」那 620ms 飞行途中
 * 出现,首次进 Lab 时浏览器才开始拉,正好卡在动画最需要它的那一帧上——宠物会先愣一下。
 *
 * 另外三张经 CSS `mask-image` 消费(MaskIcon)。这也是这里用 `new Image()` 而不是
 * `<link rel=preload as=image>` 的原因:后者对 mask 资源在部分浏览器上匹配不到,
 * 会留下「preloaded but not used」的警告;`new Image()` 只是把资源灌进 HTTP 缓存,
 * 谁来取都算命中。
 *
 * 刻意不含 polaris-pet-static / -typing:它们当前没有消费者,预热了只是白占带宽。
 */
const LAB_SPRITES = [
  "/marks/polaris-pet-jump.svg",
  "/marks/polaris-pet-sit.svg",
  "/marks/polaris-star.svg",
  "/marks/polaris.svg",
  "/marks/lab-flask.svg",
];

/**
 * 画布右下角的 AI 入口(Polaris)。把原来的 Siri 玻璃光球换成品牌像素桌宠「小北极星」:
 * 桌宠光身立在右下角(无底板,轮廓自己立得住,套圈会退回「图标」感),身后一层柔和呼吸光晕。
 * 平时轮换做小动作(轻跳/晃头/左右看/竖耳/点脚/眨眼/天线探头/抖落星点),
 * hover 切到雀跃帧(快跳冒星),
 * 生成中(isRunning)切到专注思考帧(抬头冒灵感星)。hover 用 framer-motion 弹簧轻抬(不弹跳)。
 * `absolute bottom-6 right-6` 自动避开右侧模板栏;可见性门控由父层(isCloudMode)决定。
 */
export function AiFab({ onClick, isRunning = false }: AiFabProps) {
  const { t } = useTranslation();
  const label = t("tools.polaris");
  const [hovered, setHovered] = useState(false);

  // 预载非静息帧,避免首次切换时 <img> 加载导致的一帧闪白;
  // 顺带把 AI Lab 的几张也拉进缓存(见 LAB_SPRITES)——看得见这颗 FAB,就意味着随时可能进 Lab。
  useEffect(() => {
    [PET_EXCITED, PET_THINKING, ...LAB_SPRITES].forEach((src) => {
      const img = new Image();
      img.src = src;
      // 光有字节还不够：首帧真正要的是解码后的位图。decode() 把这一步也提前，
      // 否则第一次用到时仍会在绘制线程上补一次解码。失败不影响后续正常加载。
      void img.decode?.().catch(() => {});
    });
  }, []);

  const petSrc = isRunning ? PET_THINKING : hovered ? PET_EXCITED : PET_IDLE;

  return (
    // 入场包在外层(比 dock 再晚半拍,轻微缩放淡入,像桌宠「登场」);按钮本体只保留
    // hover/tap 弹簧,二者互不串扰(同元素上 initial/animate 的 transition 会拖慢 hover 回落)。
    <motion.div
      className="absolute bottom-6 right-6 z-20"
      initial={{ opacity: 0, scale: 0.92, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.42 }}
    >
      <motion.button
        type="button"
        onClick={onClick}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        aria-label={label}
        title={label}
        aria-busy={isRunning || undefined}
        data-running={isRunning ? "true" : "false"}
        whileHover={{ y: -6 }}
        whileTap={{ y: -2, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.7 }}
        className={cn(
          "polaris-fab polaris-pet-fab group relative grid place-items-center rounded-full",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50",
        )}
      >
        <span aria-hidden className="polaris-fab__halo" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={petSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="polaris-pet-fab__sprite relative transition-[filter] duration-200 group-hover:brightness-105"
        />
        <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-neutral-800 bg-neutral-900/90 px-2 py-1 text-xs text-sky-200 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {label}
        </span>
      </motion.button>
    </motion.div>
  );
}
