"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Keep Framer Motion's reduced-motion handling consistent between the server
 * and the client. Branching `initial` props on `useReducedMotion()` causes
 * hydration mismatches because the server cannot know the user's preference.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
