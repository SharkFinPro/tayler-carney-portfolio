"use client";

import { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

// Globally respect the user's prefers-reduced-motion setting for every Framer
// Motion animation (translate/layout animations are disabled; content is never
// left hidden behind motion).
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
