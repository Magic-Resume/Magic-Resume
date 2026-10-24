"use client";

import {
  motion,
  type HTMLMotionProps,
  useReducedMotion,
} from "framer-motion";
// 显式引入 React：本仓的 `jsx: preserve` 下，测试用的 tsx 走经典变换，缺它会在
// 渲染期报 `React is not defined`——而这个组件正是搜索行展开区的载体。
import React, { type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export interface AgentDisclosureProps
  extends Omit<HTMLMotionProps<"div">, "animate" | "initial"> {
  open: boolean;
  openHeight?: CSSProperties["height"];
}

/**
 * Agent disclosure. Only the motion package import was adapted to the one
 * already installed by this project.
 */
export default function AgentDisclosure({
  open,
  openHeight = "auto",
  className,
  style,
  transition,
  ...props
}: AgentDisclosureProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <motion.div
      {...props}
      aria-hidden={!open}
      inert={!open}
      initial={false}
      animate={
        reduce
          ? { opacity: open ? 1 : 0 }
          : {
              opacity: open ? 1 : 0,
              clipPath: open ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)",
              y: open ? 0 : -4,
            }
      }
      transition={
        transition ?? {
          duration: reduce ? 0 : open ? 0.22 : 0.14,
          ease: EASE_OUT,
        }
      }
      className={cn("overflow-hidden", className)}
      style={{
        ...style,
        height: open ? openHeight : 0,
        pointerEvents: open ? undefined : "none",
        transformOrigin: "top",
      }}
    />
  );
}
