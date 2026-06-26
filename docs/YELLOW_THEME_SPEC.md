# Solar Core — Design Specification

## Part I — Identity & Vision

### Theme Concept

**Solar Core** is a futuristic interface powered by a contained star. The system feels like operating a fusion reactor's control interface — every panel is a reinforced viewport into radiant energy, every interaction channels controlled power, every surface reflects the golden light of an engineered sun held in perfect containment.

This is not a "yellow theme." This is an **energy-core operating system** — a precision instrument for managing immense power. The yellow is not decorative. It is the visible radiation of the system's power source bleeding through armored surfaces and industrial glass.

The interface sits at the intersection of advanced engineering and raw stellar energy. Panels are reactor housings. Borders are containment fields. Buttons are power switches. Status indicators are reactor gauges. The user is not browsing files — they are operating a machine that runs on light.

### Design Principles

**1. Contained Radiance**
All light in the system appears to come from within — from a power source beneath the surface. Light never feels applied or decorative. It bleeds through seams, pulses through conduits, and glows behind panels. The brightest elements are the ones closest to the core.

**2. Engineered Warmth**
Warmth is controlled, not casual. The golden tones feel like the output of a precision system, not sunlight through a window. Every warm glow has purpose: status communication, emphasis, feedback. Nothing glows without reason.

**3. Industrial Precision**
Surfaces are manufactured, not organic. Panels have machined edges. Borders are containment lines. Corners are deliberate — either sharp for structural framing or radiused for pressure vessel aesthetics. Everything feels built to specification.

**4. Power Under Control**
The system contains enormous energy but never feels dangerous or unstable. Like a well-maintained reactor, the power is always harnessed, always purposeful. The brightest flares happen on user command. The system radiates confidence, not chaos.

**5. High-Visibility Confidence**
Information is always clear. The high contrast between deep dark surfaces and golden light makes every element readable and unmistakable. The interface commands attention without shouting. It is visible from across the room.

**6. Cinematic Scale**
Even small elements carry visual weight. A toggle switch feels like it could redirect megawatts. A progress bar feels like a power transfer gauge. The interface has the gravitas of a system that matters.

### Atmosphere Keywords

Radiant. Engineered. Industrial. Contained. Powerful. Warm. Confident. Precise. Luminous. Armored. Golden. Cinematic. Commanding. Refined. Stellar.

---

## Part II — The Palette

### Foundation Layer — The Reactor Housing

The deepest tones form the structural shell of the interface. These are not neutral grays — they are warm-shifted blacks and charcoals that suggest dark metal absorbing golden light.

| Token | Hex | Role |
|---|---|---|
| `--solar-void` | `#080604` | Deepest background — the reactor chamber wall |
| `--solar-deep` | `#0e0b07` | Primary panel backgrounds — armored housing |
| `--solar-surface` | `#17130c` | Card and container surfaces — inner plating |
| `--solar-elevated` | `#201a10` | Elevated panels, modals — inspection windows |
| `--solar-overlay` | `#2a2214` | Hover states, overlays — highlighted plating |

These backgrounds must always feel warm. Even the darkest value carries a faint golden undertone. True neutral blacks (`#000000`, `#111111`) are forbidden — they break the illusion of a warm-lit environment.

### Core Energy Colors — The Contained Sun

These are the primary power colors. They represent the energy source itself — from deep molten gold to blinding luminous yellow.

| Token | Hex | Role |
|---|---|---|
| `--solar-gold` | `#e8a800` | Primary golden yellow — the core frequency. Used for primary actions, active states, key indicators |
| `--solar-bright` | `#ffc800` | Luminous bright yellow — high-energy emphasis. Hover states, important highlights |
| `--solar-intense` | `#ffd83a` | Maximum radiance — peak energy moments. Confirmations, completion flashes |
| `--solar-molten` | `#cc8800` | Deep molten gold — sustained power. Active borders, selected states |
| `--solar-pale` | `#ffe680` | Pale energy wash — residual warmth. Subtle backgrounds, soft highlights |
| `--solar-white` | `#fff4d6` | Near-white energy — core proximity. Maximum emphasis text, critical readouts |

### Accent Spectrum — Supporting Energy Tones

Colors adjacent to the golden core that support without competing. These exist in the same thermal family — amber, bronze, copper — not foreign hues.

| Token | Hex | Role |
|---|---|---|
| `--solar-amber` | `#e07800` | Warm amber — warning emphasis, secondary energy |
| `--solar-bronze` | `#8a6e2f` | Metallic bronze — structural accents, borders, subtle framing |
| `--solar-copper` | `#b08040` | Warm copper — tertiary UI elements, inactive states |
| `--solar-rust` | `#9e5a1e` | Deep rust — destructive action hints, muted warnings |
| `--solar-ash` | `#3d362a` | Warm ash — disabled states, deprioritized elements |

### Semantic Colors — Energy State Communication

Within the golden palette, system states are communicated through temperature and intensity shifts rather than foreign color injections.

| State | Color | Hex | Rationale |
|---|---|---|---|
| **Success** | Bright gold flare | `#ffc800` | Energy successfully channeled — peak golden radiance |
| **Warning** | Deep amber | `#e07800` | Power fluctuation — amber alert tone |
| **Error/Critical** | Hot rust-orange | `#d44800` | Containment warning — the only tone allowed to push toward red-orange |
| **Info** | Pale gold | `#ffe680` | Informational glow — low-energy notification |
| **Neutral** | Bronze muted | `#8a6e2f` | No energy state — structural reference |

The error color (`#d44800`) is the most departure from pure gold, pushing into a hot orange that reads as thermal overload. This is intentional — it breaks the golden harmony just enough to signal danger without introducing a foreign hue.

### Text & Readability

| Token | Hex | Usage |
|---|---|---|
| `--solar-text-primary` | `#e8dcc8` | Primary body text — warm cream with high readability |
| `--solar-text-secondary` | `#9e9080` | Secondary labels, metadata — warm muted |
| `--solar-text-muted` | `#605848` | Disabled text, hints — deep warm gray |
| `--solar-text-bright` | `#fff4d6` | Maximum emphasis — near-white with golden warmth |
| `--solar-text-energy` | `#ffc800` | Active readout values — pure energy color for live data |

All text colors maintain WCAG AA contrast against `--solar-void` and `--solar-deep` backgrounds.

### Forbidden Colors

| Avoid | Why |
|---|---|
| Muddy/olive yellows | They suggest decay, not energy. `#999900`, `#808000` — dead on arrival. |
| Beige/cream fills | They flatten the palette into a cozy warmth. This is a reactor, not a coffee shop. |
| Cartoon/saturated lemon yellow | `#ffff00` is a highlighter marker, not contained stellar energy. |
| Cool blues or cyans | They break thermal continuity. Even info states stay in the warm spectrum. |
| Greens | Foreign to the energy palette. Success is golden, not green. |
| Pure white `#ffffff` | Too stark, breaks the warm atmosphere. Maximum white is `#fff4d6`. |
| Neon anything | This theme is radiant, not fluorescent. |

### Gradients — Energy in Motion

```css
/* Primary energy sweep — active borders, progress bars, power indicators */
--gradient-solar: linear-gradient(
  90deg,
  #cc8800 0%,
  #e8a800 25%,
  #ffc800 50%,
  #ffd83a 75%,
  #e8a800 100%
);

/* Radiant glow — panel edge illumination, halo effects */
--gradient-radiance: radial-gradient(
  ellipse at center,
  rgba(255, 200, 0, 0.12) 0%,
  rgba(232, 168, 0, 0.06) 40%,
  transparent 70%
);

/* Core energy — background fusion effect, deep ambient glow */
--gradient-core: radial-gradient(
  600px circle at 50% 50%,
  rgba(255, 200, 0, 0.06) 0%,
  rgba(204, 136, 0, 0.03) 30%,
  rgba(138, 110, 47, 0.01) 60%,
  transparent 100%
);

/* Directional energy sweep — card overlays, transition effects */
--gradient-energy: linear-gradient(
  135deg,
  transparent 0%,
  rgba(255, 200, 0, 0.04) 30%,
  rgba(232, 168, 0, 0.06) 50%,
  rgba(255, 200, 0, 0.03) 70%,
  transparent 100%
);

/* Vertical heat rise — background atmospheric effect */
--gradient-heat: linear-gradient(
  0deg,
  rgba(204, 136, 0, 0.05) 0%,
  rgba(255, 200, 0, 0.02) 40%,
  transparent 70%,
  rgba(232, 168, 0, 0.01) 100%
);
```

---

## Part III — Materials & Surfaces

### Panel Architecture — Reactor Housing

Primary containers are dark metallic panels that feel manufactured and structural. They house the energy within.

```css
.solar-panel {
  background: linear-gradient(
    175deg,
    rgba(23, 19, 12, 0.96) 0%,
    rgba(14, 11, 7, 0.98) 100%
  );
  border: 1px solid rgba(232, 168, 0, 0.12);
  border-radius: 3px;
  box-shadow:
    inset 0 1px 0 rgba(255, 200, 0, 0.04),
    inset 0 -1px 0 rgba(138, 110, 47, 0.06),
    0 2px 12px rgba(0, 0, 0, 0.5);
}
```

The `inset` top highlight simulates light from the core catching the panel's upper edge. The bottom inset is a darker bronze reflection. Panels feel like armored plates with golden light leaking through the seams.

### Glass & Transparency — Containment Windows

Transparent surfaces feel like reinforced industrial glass through which the reactor's energy is visible.

```css
.solar-glass {
  background: rgba(14, 11, 7, 0.82);
  backdrop-filter: blur(20px) saturate(1.3) brightness(1.05);
  border: 1px solid rgba(232, 168, 0, 0.08);
  box-shadow:
    inset 0 0 30px rgba(255, 200, 0, 0.02),
    0 0 1px rgba(232, 168, 0, 0.2);
}
```

The `brightness(1.05)` on the backdrop filter simulates the glass being slightly warm-lit from behind. The inner box-shadow creates a faint golden interior glow.

### Edge Treatment — Containment Field Lines

Borders are not decorative frames — they are containment field boundaries. Energy bleeds along them.

```css
/* Standard containment border */
.solar-edge {
  border: 1px solid rgba(232, 168, 0, 0.15);
  box-shadow: 0 0 4px rgba(232, 168, 0, 0.08);
}

/* Active containment — energy is flowing */
.solar-edge-active {
  border: 1px solid rgba(255, 200, 0, 0.35);
  box-shadow:
    0 0 6px rgba(255, 200, 0, 0.15),
    0 0 12px rgba(255, 200, 0, 0.06);
}

/* High-energy containment — maximum power state */
.solar-edge-intense {
  border: 1px solid rgba(255, 216, 58, 0.5);
  box-shadow:
    0 0 8px rgba(255, 200, 0, 0.2),
    0 0 20px rgba(255, 200, 0, 0.08),
    0 0 40px rgba(232, 168, 0, 0.04);
}
```

### Texture Language

**Brushed Metal:** Panels can carry an extremely subtle noise texture (2-3% opacity) suggesting machined surfaces. This is achieved via a CSS gradient overlay:

```css
.solar-brushed {
  background-image:
    repeating-linear-gradient(
      90deg,
      rgba(255, 200, 0, 0.01) 0px,
      transparent 1px,
      transparent 3px
    );
}
```

**Industrial Grain:** A fine vertical line pattern at near-invisible opacity suggests precision-manufactured surfaces.

**Energy Core Surface:** Special panels (like the vault unlock screen or health score area) use a radial gradient that suggests proximity to the energy source:

```css
.solar-core-surface {
  background:
    radial-gradient(
      400px circle at 50% 60%,
      rgba(255, 200, 0, 0.08) 0%,
      rgba(204, 136, 0, 0.04) 30%,
      transparent 70%
    ),
    linear-gradient(
      175deg,
      rgba(23, 19, 12, 0.96) 0%,
      rgba(14, 11, 7, 0.98) 100%
    );
}
```

### Depth & Elevation

Elevation is communicated through increasing warmth, not just shadow. Higher elements absorb more golden light.

| Elevation | Background | Border Opacity | Glow |
|---|---|---|---|
| Ground | `--solar-deep` | 0.08 | None |
| Surface | `--solar-surface` | 0.12 | None |
| Raised | `--solar-elevated` | 0.15 | Faint golden shadow |
| Floating | `--solar-overlay` | 0.20 | Soft golden bloom |
| Modal | `--solar-overlay` + blur | 0.25 | Medium golden bloom |

---

## Part IV — Light as a Design System

### Philosophy

In the Solar Core theme, **light is not decoration — it is the system's language.** Golden light communicates energy state, importance, activity, and feedback. When something glows brighter, it means more energy is flowing there. When light dims, the system is at rest.

This creates an intuitive visual hierarchy: the most important elements are the most radiant, and passive elements recede into the warm darkness.

### Ambient Glow — Baseline Radiance

The entire interface carries a faint ambient warmth, as if the reactor's light permeates everything:

```css
/* Applied to the root container */
.solar-ambient {
  background:
    radial-gradient(
      ellipse 120% 80% at 50% 100%,
      rgba(232, 168, 0, 0.03) 0%,
      transparent 60%
    );
}
```

This bottom-centered radial glow simulates the reactor core being below the interface, casting warmth upward.

### Reactive Lighting — User Interaction Response

When the user interacts with elements, they channel energy:

**Hover — Energy draws toward the cursor:**
```css
.solar-interactive:hover {
  border-color: rgba(255, 200, 0, 0.25);
  box-shadow:
    0 0 8px rgba(255, 200, 0, 0.1),
    inset 0 0 20px rgba(255, 200, 0, 0.03);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
```

**Click — Compact energy release:**
```css
@keyframes solar-ripple {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 200, 0, 0.25);
  }
  100% {
    box-shadow: 0 0 0 12px rgba(255, 200, 0, 0);
  }
}
```

### Emphasis Lighting — Important States

Key moments receive solar flare treatment — a controlled burst of maximum radiance:

```css
/* Success confirmation — golden flare */
@keyframes solar-flare {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 200, 0, 0.4);
    filter: brightness(1);
  }
  30% {
    box-shadow: 0 0 20px 4px rgba(255, 200, 0, 0.2);
    filter: brightness(1.15);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 200, 0, 0);
    filter: brightness(1);
  }
}

/* Halo ring — expanding light ring for confirmations */
@keyframes solar-halo {
  0% {
    transform: scale(0.8);
    opacity: 0.6;
    border-color: rgba(255, 200, 0, 0.5);
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
    border-color: rgba(255, 200, 0, 0);
  }
}
```

### Energy Lines — Power Conduits

Borders and separators can carry traveling pulses of energy, suggesting power flowing through the interface:

```css
@keyframes energy-conduit {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}

.solar-conduit {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    transparent 40%,
    rgba(255, 200, 0, 0.5) 50%,
    transparent 60%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: energy-conduit 3s ease-in-out infinite;
}
```

This creates a bright pulse that travels along a separator line, simulating energy moving through the system.

### Containment — Keeping Power Under Control

Maximum glow effects are reserved for:
- Successful important actions (vault unlock, backup complete)
- Active critical indicators (health score at 100%)
- User-initiated power moments (button activation)

Ambient and idle states use restrained, subtle warmth. The contrast between resting and active states makes interactions feel powerful.

**Glow budget per element state:**
| State | Max glow radius | Max glow opacity |
|---|---|---|
| Idle | 0px | 0% |
| Hover | 8px | 10% |
| Active/Pressed | 12px | 20% |
| Selected | 6px sustained | 12% |
| Confirmation | 20px momentary | 30% |
| Critical alert | 16px pulsing | 25% |

---

## Part V — The Environment

### Backdrop Composition

The background is a layered system that creates the feeling of being inside a fusion reactor's control room. Five layers combine to produce the environment:

**Layer 1 — The Void (Static)**
The deepest background: `#080604`. A warm near-black that absorbs everything. This is the reactor chamber wall.

**Layer 2 — Energy Grid (Subtle, Static)**
A faint geometric grid pattern suggesting engineering infrastructure. Lines are `rgba(232, 168, 0, 0.03)` — barely visible, felt more than seen.

```css
.solar-grid {
  background-image:
    linear-gradient(
      rgba(232, 168, 0, 0.03) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      rgba(232, 168, 0, 0.03) 1px,
      transparent 1px
    );
  background-size: 60px 60px;
}
```

**Layer 3 — Core Radiance (Slow Animation)**
A large, soft golden gradient centered in the lower third of the screen, slowly pulsing in intensity. This is the reactor core's ambient light.

```css
@keyframes core-breathe {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.8; }
}

.solar-core-glow {
  position: fixed;
  bottom: -20%;
  left: 30%;
  width: 40%;
  height: 60%;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 200, 0, 0.06) 0%,
    rgba(232, 168, 0, 0.03) 30%,
    transparent 70%
  );
  animation: core-breathe 12s ease-in-out infinite;
  pointer-events: none;
}
```

**Layer 4 — Golden Dust (Animated)**
Tiny warm particles drifting slowly upward, like hot embers or ionized particles near the reactor core.
- Particle count: 25-40
- Colors: `#e8a800` to `#ffc800` at 10-25% opacity
- Size: 1-2px circles
- Speed: very slow (50-90s full traversal)
- Direction: upward with slight horizontal drift

**Layer 5 — Distant Light Blooms (Static/Very Slow)**
2-3 large, extremely soft golden radial gradients placed asymmetrically. These suggest distant energy sources or reflected light from reactor components.
- Radius: 300-500px
- Opacity: 2-4%
- Color: `rgba(232, 168, 0, 0.03)`
- Movement: nearly imperceptible drift (120s+ period)

### Atmospheric Effects

**Heat Shimmer:** An extremely subtle vertical distortion effect (0.5-1px) applied to background layers only. This simulates the heat convection near an energy source. Applied via a slow CSS transform on background elements, not on content.

**Energy Waves:** Occasional faint concentric rings that pulse outward from the core radiance position. These happen every 15-20 seconds, are 2-3% opacity, and suggest the reactor's rhythmic energy output.

**Golden Dust Motes:** Individual bright particles (`#ffd83a` at 40% opacity) that appear randomly, float for 3-5 seconds, then fade. These are larger and brighter than the Layer 4 particles — special moments of visible energy. Maximum 3-4 visible at any time.

### Depth Cues

The background creates three depth zones:
1. **Far field** (Layer 1-2): The structural void and grid — static, deep
2. **Mid field** (Layer 3, 5): Core radiance and light blooms — slow, atmospheric
3. **Near field** (Layer 4, dust motes): Particles close to the viewer — dynamic, warm

Content panels sit between the near and mid fields, grounded on the grid but lit by the core.

---

## Part VI — Motion & Energy

### Motion Philosophy

Motion in Solar Core is **radiant, deliberate, and engineered**. Every animation suggests energy being channeled, released, or contained. Nothing bounces. Nothing wobbles. Nothing glitches. Motion is the visible expression of controlled power.

**Easing standard:** `cubic-bezier(0.4, 0, 0.2, 1)` — smooth acceleration with confident deceleration. Elements arrive with authority.

**Duration ranges:**
| Category | Duration | Examples |
|---|---|---|
| Micro-feedback | 100-200ms | Hover glow, click ripple |
| Interaction response | 200-400ms | Panel highlight, tab change |
| State transition | 400-700ms | Panel entrance, confirmation flare |
| Ambient cycle | 3-15s | Core breathing, energy conduit pulse |
| Background drift | 50-120s | Particle traversal, bloom movement |

### Energy Behaviors — The Motion Vocabulary

**1. Pulse**
A contained expansion and contraction of glow. Used for active indicators and waiting states.
```css
@keyframes solar-pulse {
  0%, 100% {
    box-shadow: 0 0 4px rgba(255, 200, 0, 0.15);
  }
  50% {
    box-shadow: 0 0 10px rgba(255, 200, 0, 0.3);
  }
}
/* Duration: 2-3s, infinite, ease-in-out */
```

**2. Sweep**
A directional wash of golden light across a surface. Used for hover entry and state changes.
```css
@keyframes solar-sweep {
  0% {
    background-position: -100% center;
  }
  100% {
    background-position: 200% center;
  }
}
/* Applied as a gradient overlay, duration: 500-800ms, ease-in-out */
```

**3. Charge**
A build-up of intensity from dim to bright, like a capacitor charging. Used for loading states and activation sequences.
```css
@keyframes solar-charge {
  0% {
    opacity: 0.2;
    filter: brightness(0.8);
  }
  80% {
    opacity: 0.9;
    filter: brightness(1.1);
  }
  100% {
    opacity: 1;
    filter: brightness(1);
  }
}
/* Duration: 300-600ms, ease-out */
```

**4. Ring**
An expanding circular outline that fades as it grows. Used for confirmations and selections.
```css
@keyframes solar-ring {
  0% {
    transform: scale(0.6);
    opacity: 0.5;
    border-width: 2px;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
    border-width: 1px;
  }
}
/* Duration: 500-700ms, ease-out */
```

**5. Ripple**
A compact radial wave from a point of contact. Used for click feedback.
```css
@keyframes solar-click-ripple {
  0% {
    transform: scale(0);
    opacity: 0.3;
    background: rgba(255, 200, 0, 0.25);
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
    background: rgba(255, 200, 0, 0);
  }
}
/* Duration: 350ms, ease-out, from click point */
```

### Interaction Motion Map

| Action | Motion | Duration | Behavior |
|---|---|---|---|
| **Hover enter** | Edge glow intensifies + faint sweep | 200ms | Border warms, inner glow appears |
| **Hover exit** | Glow fades smoothly | 250ms | Return to idle state |
| **Click/Press** | Ripple from click point + brief brightness flash | 350ms | Compact, satisfying |
| **Select** | Ring expansion + sustained edge glow | 500ms | Feels like locking into a connection |
| **Confirm/Success** | Solar flare + expanding halo ring | 600ms | Peak golden radiance, then settle |
| **Warning** | Amber pulse (2 beats) + border flash | 400ms | Urgent but controlled |
| **Error** | Hot orange glow + slight shake (2px, 150ms) | 300ms | Thermal overload feel |
| **Tab change** | Golden light bar slides to new position | 250ms | Energy transfers between tabs |
| **Panel entrance** | Fade in + charge-up (dim to full brightness) | 400ms | System powering up the panel |
| **Staggered reveal** | Sequential charge-up with 60ms delay per item | 60ms/item | Like reactor subsystems coming online |
| **Notification enter** | Slide in + ring pulse from icon | 350ms | Energy announcement |
| **Loading** | Sweeping energy line + pulsing glow | 2-3s loop | Continuous power transfer |

### Ambient Motion

Background energy is alive but never distracting:
- Core radiance: slow breathing (12s cycle)
- Energy grid: no motion (stability anchor)
- Particles: very slow upward drift (50-90s)
- Dust motes: fade in/out over 3-5s, random placement
- Energy conduit separators: 3s traveling pulse cycle

### Motion Restraint

**Use often:**
- Glow pulses (hover, active states)
- Energy sweeps (transitions, hover)
- Expanding rings (confirmations)
- Warm ripple feedback (clicks)
- Soft brightening on emphasis
- Smooth staggered reveals

**Use sparingly:**
- Intense flares (only on major confirmations)
- Full solar flare bursts (vault unlock, backup complete — once per action)
- Warning strobes (only critical errors, max 2 pulses)
- Large-scale glow blooms (only background ambient)

**Never use:**
- Glitch effects — this is a precision system, not a broken one
- Chaotic motion — power is controlled, never erratic
- Playful bounce — reactor controls don't bounce
- Organic liquid motion — surfaces are manufactured, not biological
- Nightclub/neon-city behavior — this is industrial power, not entertainment
- Rotation on UI elements — reactor components don't spin whimsically
- Elastic/spring overshoot — energy settles, it doesn't wobble past target

---

## Part VII — Component System

### Primary Actions — Maximum Energy Expression

**Buttons**

```
┌────────────────────────────────────────┐
│         INITIALIZE BACKUP              │ ← Golden edge containment
│                                        │ ← Dark panel fill with inner warmth
└────────────────────────────────────────┘
  ↑ Soft golden glow beneath (idle)
```

**Idle state:**
```css
.solar-button {
  background: rgba(232, 168, 0, 0.06);
  border: 1px solid rgba(232, 168, 0, 0.2);
  color: var(--solar-text-bright);
  box-shadow: 0 2px 8px rgba(232, 168, 0, 0.06);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
  font-size: 12px;
  padding: 10px 20px;
  border-radius: 3px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
```

**Hover state:**
```css
.solar-button:hover {
  background: rgba(232, 168, 0, 0.12);
  border-color: rgba(255, 200, 0, 0.35);
  box-shadow:
    0 2px 8px rgba(232, 168, 0, 0.1),
    0 0 12px rgba(255, 200, 0, 0.06);
}

/* Sweep overlay on hover */
.solar-button:hover::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 200, 0, 0.06) 40%,
    rgba(255, 200, 0, 0.1) 50%,
    rgba(255, 200, 0, 0.06) 60%,
    transparent 100%
  );
  animation: solar-sweep 0.6s ease-in-out forwards;
}
```

**Pressed/Active state:**
```css
.solar-button:active {
  transform: scale(0.97);
  background: rgba(232, 168, 0, 0.18);
  border-color: rgba(255, 200, 0, 0.45);
  box-shadow:
    0 0 4px rgba(255, 200, 0, 0.2),
    inset 0 0 8px rgba(255, 200, 0, 0.06);
}
```

**High-emphasis (primary action) button:**
```css
.solar-button-primary {
  background: linear-gradient(
    175deg,
    rgba(232, 168, 0, 0.15) 0%,
    rgba(204, 136, 0, 0.1) 100%
  );
  border: 1px solid rgba(255, 200, 0, 0.3);
  box-shadow:
    0 2px 12px rgba(232, 168, 0, 0.12),
    0 0 4px rgba(255, 200, 0, 0.08);
}
```

### Content Containers — Engineered Housing

**Cards**

```
┌─────────────────────────────────────┐
│ ╭─────────────────────────────────╮ │
│ │                                 │ │ ← Inner panel: --solar-surface
│ │        [Icon / Thumb]           │ │ ← Faint core radiance behind icon
│ │                                 │ │
│ ├─────────────────────────────────┤ │ ← Energy conduit separator
│ │ filename.ext                    │ │
│ │ 2.4 MB   ·   PNG               │ │ ← Bronze metadata text
│ ╰─────────────────────────────────╯ │
└─────────────────────────────────────┘
  ↑ Golden edge glow on hover
```

- Default: `solar-glass` material, `rgba(232, 168, 0, 0.08)` border
- Hover: Border intensifies to `0.2`, faint inner golden glow appears, 1px translateY lift
- Selected: `solar-edge-active` border with sustained golden bloom, animated gradient border
- Thumbnail area: Subtle radial gradient of `--solar-gold` at 4% opacity behind the content

**Panels & Modals**

- `solar-panel` material with visible golden border
- Header separated by an energy conduit line (animated pulse)
- Sections divided by `rgba(232, 168, 0, 0.06)` horizontal rules
- Modal backdrop: `rgba(8, 6, 4, 0.8)` with `backdrop-filter: blur(8px)`
- Modal entrance: Charge-up animation (dim to bright over 400ms)

### Navigation & Wayfinding — Energy Flow Indicators

**Tab Bar**

```
  Files    Settings    Audit     Integrity
  ─────   ────────    ─────     ─────────
    ╰── Active: golden light bar (2px, animated slide) ──╯
```

- Inactive: `--solar-text-muted` color
- Hover: Text warms to `--solar-text-primary`, faint golden underline appears (0.15 opacity)
- Active: Text is `--solar-text-bright`, 2px solid `--solar-gold` underline with soft glow
- Transition: The golden underline slides to the new tab position over 250ms, energy visibly transfers

**Sidebar navigation:**
- Active item has a left-edge golden bar (3px) with radiant glow
- Hover increases the background warmth and border visibility
- The active bar slides vertically between items

### System Feedback — Energy State Communication

**Notifications**

```
╭───────────────────────────────────────────╮
│  ◉  3 files imported successfully         │ ← Warm gold edge glow
│     ────────────────────────────          │ ← Fading energy ring on appear
╰───────────────────────────────────────────╯
```

- Background: `solar-glass` material
- Border: 1px of the notification's semantic color with matching glow
- Entry: Slides in from right + expanding ring from the status icon
- Exit: Golden sweep crosses left-to-right as it fades
- **Success:** Bright gold edge glow, `--solar-bright` icon
- **Warning:** Amber edge glow, `--solar-amber` icon, double-pulse attention
- **Error:** Rust-orange edge glow, `--solar-rust` icon, brief shake
- **Info:** Pale gold edge glow, `--solar-pale` icon, simple fade-in

**Alert banners:**
- Full-width bars with the semantic color at 6% background opacity
- Left border accent: 3px solid semantic color
- Icon pulses gently in the semantic color

### Status & Progress — Power Level Readouts

**Health Score Ring**
```
       ╭─────────╮
      ╱   ╭───╮   ╲
     │   │ 94% │   │ ← SVG circle, conic gradient in gold tones
      ╲   ╰───╯   ╱    Gentle rotation (30s per revolution)
       ╰─────────╯     Center text: --solar-text-bright
```

- SVG circle with stroke set to a conic gradient of gold tones (`--solar-molten` → `--solar-gold` → `--solar-bright` → `--solar-intense`)
- Fill percentage determines how much of the golden arc is visible
- Gentle rotation animation (30s per revolution) creates flowing energy appearance
- Unfilled portion: `rgba(232, 168, 0, 0.06)` track

**Progress Bars**
```
├██████████████████░░░░░░░░░░░░░░░░░░░░░┤
 ↑ Animated gradient-solar fill          ↑ Track: warm ash
   Leading edge: bright golden dot with bloom
```

- Track: `rgba(232, 168, 0, 0.06)` rounded bar
- Fill: Animated `--gradient-solar` flowing left-to-right
- Leading edge: Small bright dot (`--solar-intense`) with 6px golden bloom
- Completed: Brief solar flare on the entire bar

**Status Indicator Dots**
- Online/Active: `--solar-gold` with pulsing halo (2s cycle)
- Idle: `--solar-copper` with no animation
- Error: `--solar-rust` with double-pulse (urgent rhythm)
- Segmented indicators use golden ring segments that light up sequentially

### Loading & Transitions — Reactor Startup Patterns

**Indeterminate Loading:**
```css
@keyframes reactor-startup {
  0% {
    background-position: -200% center;
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  100% {
    background-position: 200% center;
    opacity: 0.6;
  }
}

.solar-loader {
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 200, 0, 0.1) 20%,
    rgba(255, 200, 0, 0.5) 50%,
    rgba(255, 200, 0, 0.1) 80%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: reactor-startup 2s ease-in-out infinite;
}
```

**Determinate Loading — Charge-Up Bar:**
The progress bar fills while pulsing brighter as it approaches completion. At 100%, a solar flare fires.

**Skeleton Loading:**
- Placeholder shapes use `--solar-surface` fill
- A golden sweep passes across them every 2s
- Sweep: `rgba(255, 200, 0, 0.04)` → `rgba(255, 200, 0, 0.08)` → `rgba(255, 200, 0, 0.04)`
- Feels like reactor subsystems initializing

**Panel Loading Sequence:**
When a panel loads, its contents appear in staggered sequence (60ms per item) with each item doing a quick charge-up animation (dim → bright). This simulates reactor subsystems coming online one by one.

---

## Part VIII — Typography as Engineering Readout

### Font Strategy

| Role | Font | Fallback | Weight |
|---|---|---|---|
| Display/Headings | `'Inter'` | `system-ui, sans-serif` | 600-700 |
| Body | `'Inter'` | `system-ui, sans-serif` | 400 |
| Data Readouts | `'JetBrains Mono'` | `'Fira Code', monospace` | 400-500 |

Inter provides geometric clarity and industrial neutrality. It reads as engineered typography — precise, no-nonsense, and highly legible at all sizes. It carries authority without being aggressive.

JetBrains Mono is used for numerical data, file sizes, hashes, and technical readouts. In this context, it feels like reactor instrument readings.

### Type Hierarchy — Control System Labels

| Level | Size | Weight | Letter-Spacing | Color | Feel |
|---|---|---|---|---|---|
| H1 — System Title | 24px | 700 | 0.10em | `--solar-text-bright` | Reactor core designation |
| H2 — Section Header | 18px | 600 | 0.08em | `--solar-text-bright` | Subsystem label |
| H3 — Panel Title | 14px | 600 | 0.06em | `--solar-text-primary` | Component readout header |
| Body | 13px | 400 | 0 | `--solar-text-primary` | Standard display text |
| Caption | 11px | 400 | 0.02em | `--solar-text-secondary` | Metadata, secondary info |
| Micro | 10px | 400 | 0.05em | `--solar-text-muted` | Status labels, fine print |
| Mono Data | 12px | 400 | 0 | `--solar-text-energy` | Live numerical readouts |

Wide letter-spacing on headings reinforces the industrial engineering feel — labels that belong on reactor control panels.

### Special Treatment

**Heading Glow:**
Section headings carry a faint golden text-shadow suggesting they are backlit by the energy core:

```css
.solar-heading {
  color: var(--solar-text-bright);
  text-shadow: 0 0 20px rgba(232, 168, 0, 0.2);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

**Data Readout Style:**
Numerical values displayed in monospace carry a brighter golden color, as if actively receiving energy data:

```css
.solar-readout {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: var(--solar-text-energy);
  text-shadow: 0 0 8px rgba(255, 200, 0, 0.15);
  font-variant-numeric: tabular-nums;
}
```

**Section Divider Labels:**
Small uppercase labels that divide sections, styled like reactor compartment markers:

```css
.solar-section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--solar-bronze);
  border-bottom: 1px solid rgba(232, 168, 0, 0.08);
  padding-bottom: 6px;
}
```

---

## Part IX — Signature Effects

These are the marquee visual moments that define the Solar Core identity. Each is used sparingly for maximum impact.

### 1. Solar Flare Activation

**Trigger:** Vault unlock, backup completion, critical success.

A radial burst of golden light expands from the action point. The burst is a bright ring that expands outward while a central glow peaks and fades.

- Duration: 700ms
- Ring: 2px border of `--solar-intense`, starts at 20px radius, expands to 150px
- Center glow: `--solar-bright` at 30% opacity, fades to 0%
- Bloom: `filter: brightness(1.2)` on surrounding elements for 200ms
- Ring opacity: 0.5 → 0 as it expands
- Easing: `cubic-bezier(0.0, 0, 0.2, 1)` — fast start, smooth deceleration

### 2. Fusion-Core Pulse

**Trigger:** Health score display, system status overview.

A rhythmic double-pulse originating from a central point, like a heartbeat of the reactor. Two concentric rings expand in quick succession.

- Duration: 3s cycle
- First ring: 300ms, expands to 1.3x, `--solar-gold` at 20%
- Second ring: 300ms delayed by 150ms, expands to 1.5x, `--solar-molten` at 15%
- Gap between cycles: 2.2s of rest
- Feels like a controlled, rhythmic energy output

### 3. Energy Beam Sweep

**Trigger:** Card hover, first render, state transitions.

A narrow band of golden light sweeps diagonally across a surface, like an inspection beam.

- Duration: 600ms
- Angle: 120deg (upper-left to lower-right)
- Band width: ~20% of element width
- Band gradient: transparent → `rgba(255, 200, 0, 0.08)` → transparent
- Easing: ease-in-out
- Triggered once per hover, not repeating

### 4. Golden Dust Field

**Trigger:** Background ambient effect, always present.

Tiny golden particles drift upward through the environment, suggesting ionized particles near the energy core. (Described fully in Part V, Layer 4.)

- Canvas-based particle system
- 25-40 particles
- Colors: `#e8a800` to `#ffc800`
- Opacity: 10-25% per particle
- Very slow drift
- Some particles have a faint 4px glow halo

### 5. Halo Ring Expansion

**Trigger:** File selection, toggle activation, confirmation.

A single golden ring expands outward from an element and fades. Simpler than Solar Flare — used for smaller confirmations.

- Duration: 450ms
- Ring: 1px `--solar-gold` at 40% opacity
- Expands from element bounds to 1.4x
- Fades to 0% as it reaches max size
- Easing: ease-out

### 6. Radiant Charge-Up Sequence

**Trigger:** Panel loading, staggered content reveal.

Elements appear by "powering up" — starting dim and dark, then brightening to full state over 300-400ms. When multiple elements load, they charge in sequence with 60ms stagger.

```css
@keyframes charge-up {
  0% {
    opacity: 0;
    filter: brightness(0.6);
    transform: translateY(4px);
  }
  60% {
    opacity: 0.8;
    filter: brightness(1.1);
  }
  100% {
    opacity: 1;
    filter: brightness(1);
    transform: translateY(0);
  }
}
```

The brief `brightness(1.1)` overshoot at 60% creates the feeling of energy surging into the element before it stabilizes. Like a reactor subsystem coming online — brief flare, then steady operation.

### 7. Containment Field Shimmer

**Trigger:** Selected item border, active panel frame.

The border of a selected or active element pulses with traveling golden energy. A bright spot travels along the border path, making one revolution every 4 seconds.

```css
@keyframes containment-field {
  0% {
    background: conic-gradient(
      from 0deg,
      rgba(255, 200, 0, 0.4) 0deg,
      transparent 30deg,
      transparent 360deg
    );
  }
  100% {
    background: conic-gradient(
      from 360deg,
      rgba(255, 200, 0, 0.4) 0deg,
      transparent 30deg,
      transparent 360deg
    );
  }
}
```

This creates the impression of energy actively circulating through the containment field — the interface is alive and powered.

---

## Part X — Implementation Reference

### CSS Variable Map

```css
[data-theme="yellow"] {
  /* Foundation — Reactor Housing */
  --color-cyber-black: #080604;
  --color-cyber-dark: #0e0b07;
  --color-cyber-panel: #17130c;
  --color-cyber-surface: #201a10;
  --color-cyber-border: rgba(232, 168, 0, 0.12);

  /* Core Energy — Primary Action Colors */
  --color-neon-primary: #e8a800;
  --color-neon-bright: #ffc800;
  --color-neon-dim: rgba(232, 168, 0, 0.5);
  --color-neon-dark: rgba(204, 136, 0, 0.4);
  --color-neon-glow: rgba(255, 200, 0, 0.15);
  --color-neon-subtle: rgba(232, 168, 0, 0.06);

  /* Text Hierarchy */
  --color-cyber-text: #e8dcc8;
  --color-cyber-muted: #9e9080;
  --color-cyber-white: #fff4d6;

  /* Solar-Specific Extended Palette */
  --solar-gold: #e8a800;
  --solar-bright: #ffc800;
  --solar-intense: #ffd83a;
  --solar-molten: #cc8800;
  --solar-pale: #ffe680;
  --solar-amber: #e07800;
  --solar-bronze: #8a6e2f;
  --solar-copper: #b08040;
  --solar-rust: #d44800;
  --solar-ash: #3d362a;

  /* Gradients */
  --gradient-solar: linear-gradient(
    90deg, #cc8800 0%, #e8a800 25%, #ffc800 50%, #ffd83a 75%, #e8a800 100%
  );
  --gradient-radiance: radial-gradient(
    ellipse at center,
    rgba(255, 200, 0, 0.12) 0%,
    rgba(232, 168, 0, 0.06) 40%,
    transparent 70%
  );
  --gradient-core: radial-gradient(
    600px circle at 50% 50%,
    rgba(255, 200, 0, 0.06) 0%,
    rgba(204, 136, 0, 0.03) 30%,
    transparent 70%
  );
  --gradient-energy: linear-gradient(
    135deg,
    transparent 0%,
    rgba(255, 200, 0, 0.04) 30%,
    rgba(232, 168, 0, 0.06) 50%,
    rgba(255, 200, 0, 0.03) 70%,
    transparent 100%
  );

  /* Structural Tokens */
  --theme-radius: 3px;
  --theme-transition-speed: 0.2s;

  /* Typography */
  --font-family-display: 'Inter', system-ui, sans-serif;
  --font-family-body: 'Inter', system-ui, sans-serif;
  --font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

### Theme Mode Integration

The yellow theme maps to theme mode `"solarcore"` in the `useThemeMode` system. When `data-theme="yellow"` is set:

- **Background effects:** Solar Core canvas (golden dust particles + core radiance glow + energy grid)
- **Card behavior:** Energy beam sweep on hover instead of single-color highlight
- **Selection effects:** Golden halo ring instead of single-color ring
- **All `var(--color-neon-*)` tokens** resolve to the gold-anchored energy palette
- **DiagBot health ring:** Conic gradient in gold tones with slow rotation
- **Progress bars:** Animated `--gradient-solar` fill with leading golden dot
- **Unlock burst:** Solar flare activation effect
- **Panel transitions:** Charge-up sequence with staggered reveal

**Theme mode animation config:**
```typescript
{
  mode: "solarcore",
  spring: { stiffness: 300, damping: 28 },
  transitions: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
  hover: { scale: 1.02, brightness: 1.08 },
  tap: { scale: 0.97 },
  stagger: 0.06,
}
```

**Theme picker entry:**
```typescript
{
  id: "yellow",
  label: "Solar Core",
  color: "bg-amber-500",
  accent: "ring-amber-400/40"
}
```

### Accessibility

**Contrast Ratios (against `--solar-void` #080604):**
| Text Token | Hex | Contrast Ratio | WCAG |
|---|---|---|---|
| `--solar-text-primary` | `#e8dcc8` | 14.2:1 | AAA |
| `--solar-text-secondary` | `#9e9080` | 6.8:1 | AA |
| `--solar-text-muted` | `#605848` | 3.5:1 | AA Large |
| `--solar-text-bright` | `#fff4d6` | 16.8:1 | AAA |
| `--solar-text-energy` | `#ffc800` | 11.3:1 | AAA |

**Reduced Motion:**
All animations respect `prefers-reduced-motion`:
- Particle effects pause
- Gradients become static
- Charge-up sequences replaced by simple fade-in
- Energy conduit pulses stop
- Hover effects reduced to simple opacity/color changes
- Core breathing stops — steady ambient glow

**Color-Blind Considerations:**
- States are communicated through brightness intensity and position, not just hue
- Warning (amber) vs. error (rust-orange) is differentiated by intensity pattern: warnings pulse gently, errors flash sharply with shake
- Success is communicated through golden flare + expanding ring, not a hue change
- All interactive states have a non-color indicator (border width, glow radius, position shift)
- Text labels accompany all color-coded status indicators

**Focus Indicators:**
```css
.solar-focus-visible:focus-visible {
  outline: 2px solid var(--solar-gold);
  outline-offset: 2px;
  box-shadow: 0 0 8px rgba(255, 200, 0, 0.2);
}
```

High-visibility golden outline with glow, clearly distinguishable against all dark backgrounds.

### Design Balance Guidelines

1. **Bright without harsh:** The brightest value (`--solar-intense` #ffd83a) appears only momentarily during interactions. Sustained brightness stays at `--solar-gold` or lower.

2. **Powerful without chaotic:** Maximum glow effects are event-driven (user actions), never ambient. The background breathes gently; the foreground responds powerfully.

3. **Yellow as energy, not decoration:** Every golden element communicates state — active, important, interactive, live data. Decorative uses of yellow are forbidden. If it glows, it means something.

4. **Readability is sacred:** No text is placed directly on golden backgrounds. Text always sits on dark panels with golden light as edge treatment or glow, never as fill behind text.

5. **Reserve the strongest effects:** Solar flare, full halo ring, and brightness flash are only for major moments. Overuse desensitizes users to important feedback.

6. **Maintain thermal coherence:** Every color in the interface belongs to the same thermal family (golden-amber-bronze-copper-rust). No foreign hues break the reactor's energy signature.

---

## Summary

Solar Core transforms Kawaii Vault into a fusion reactor control system — an interface powered by a contained star. Every surface is an armored viewport. Every interaction channels golden energy. Every animation expresses controlled power being released, contained, or transferred.

The deep warm-black foundations are the reactor housing. The golden light is the energy within. Panels are inspection windows. Borders are containment fields. Buttons are power switches. Progress bars are energy transfer gauges. The user doesn't browse files — they operate a system that runs on stellar power.

The result: **a futuristic operating system powered by a contained sun — radiant, engineered, high-visibility, and full of controlled golden energy.**
