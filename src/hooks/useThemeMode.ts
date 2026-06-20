import type { Theme } from "../stores/useStore";

/**
 * Returns the visual mode for a given theme.
 * "cyberpunk"  = aggressive, mechanical, sharp (crimson)
 * "biotech"    = organic, fluid, living (green)
 * "command"    = precise, holographic, scientific (blue)
 * "prismatic"  = iridescent, spectrum-shifting, ethereal (rainbow)
 * "neoncity"   = electric, vibrant, neon arcade energy (neoncity)
 * "kawaii"     = dramatic pastel sweetness, bouncy, sparkling (kawaii)
 */
export type ThemeMode = "cyberpunk" | "biotech" | "command" | "prismatic" | "neoncity" | "solarcore" | "kawaii" | "neon";

export function getThemeMode(_theme: Theme): ThemeMode {
  // Single theme — always the neon (black/pink/yellow) look.
  return "neon";
}

/** Spring config for the current mode */
export function getSpringConfig(mode: ThemeMode) {
  switch (mode) {
    case "biotech":   return { stiffness: 200, damping: 25 }; // organic, no overshoot
    case "command":   return { stiffness: 300, damping: 28 }; // precise, critically damped
    case "prismatic": return { stiffness: 250, damping: 22 }; // fluid, slight overshoot
    case "neoncity":  return { stiffness: 500, damping: 24 }; // electric, snappy with bounce
    case "solarcore": return { stiffness: 300, damping: 28 }; // engineered, controlled
    case "kawaii":    return { stiffness: 450, damping: 15 }; // bouncy, playful overshoot
    case "neon":      return { stiffness: 420, damping: 20 }; // lively neon pop
    default:          return { stiffness: 400, damping: 30 }; // snappy, mechanical
  }
}

/** Transition timing */
export function getTransition(mode: ThemeMode, type: "fast" | "normal" | "slow" = "normal") {
  const durations: Record<ThemeMode, Record<string, number>> = {
    cyberpunk: { fast: 0.15, normal: 0.25, slow: 0.4 },
    biotech:   { fast: 0.25, normal: 0.4, slow: 0.7 },
    command:   { fast: 0.15, normal: 0.3, slow: 0.45 },
    prismatic: { fast: 0.2, normal: 0.35, slow: 0.6 },
    neoncity:  { fast: 0.1, normal: 0.2, slow: 0.3 },
    solarcore: { fast: 0.15, normal: 0.25, slow: 0.4 },
    kawaii:    { fast: 0.18, normal: 0.3, slow: 0.5 },
    neon:      { fast: 0.15, normal: 0.28, slow: 0.45 },
  };
  const spring = getSpringConfig(mode);
  return {
    type: "spring" as const,
    ...spring,
    duration: durations[mode][type],
  };
}

/** Hover animation for the current mode */
export function getHoverAnimation(mode: ThemeMode) {
  switch (mode) {
    case "biotech":   return { scale: 1.01, y: -1 };   // gentle lift
    case "command":   return { scale: 1.01 };            // no lift — stays anchored
    case "prismatic": return { scale: 1.02, y: -2 };    // floating lift
    case "neoncity":  return { scale: 1.03, y: -2 };    // electric lift — bold
    case "solarcore": return { scale: 1.02, y: -1 };    // controlled lift
    case "kawaii":    return { scale: 1.05, y: -3 };    // bouncy pop
    case "neon":      return { scale: 1.04, y: -2 };    // glowing lift
    default:          return { scale: 1.02, y: -1 };     // sharp lift
  }
}

/** Tap animation for the current mode */
export function getTapAnimation(mode: ThemeMode) {
  switch (mode) {
    case "biotech":   return { scale: 0.98 };  // soft press
    case "command":   return { scale: 0.99 };  // minimal press — precision
    case "prismatic": return { scale: 0.97 };  // elastic press
    case "neoncity":  return { scale: 0.95 };  // punchy electric press
    case "solarcore": return { scale: 0.97 };  // crisp press
    case "kawaii":    return { scale: 0.92 };  // squishy press
    case "neon":      return { scale: 0.94 };  // punchy neon press
    default:          return { scale: 0.97 };  // crisp press
  }
}

/** Stagger delay between items */
export function getStaggerDelay(mode: ThemeMode) {
  switch (mode) {
    case "biotech":   return 0.04;  // organic wave
    case "command":   return 0.025; // systematic population
    case "prismatic": return 0.035; // flowing cascade
    case "neoncity":  return 0.015; // rapid-fire electric cascade
    case "solarcore": return 0.03;  // systematic charge-up sequence
    case "kawaii":    return 0.045; // playful bouncing cascade
    case "neon":      return 0.03;  // glowing cascade
    default:          return 0.02;  // rapid mechanical
  }
}
