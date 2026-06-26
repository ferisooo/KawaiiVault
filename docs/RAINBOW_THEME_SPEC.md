# Rainbow Spectrum Theme — Design Specification

## Theme Identity: "Prismatic"

A futuristic interface built from refracted light and prismatic energy. The system feels like interacting with a living spectrum — luminous, elegant, and dimensional. Every surface refracts color. Every interaction bends light. The atmosphere is cosmic and magical, yet precise and functional.

---

## 1. Color Palette — Refracted Light System

### 1.1 Background Layer (Deep Dark Foundation)

These near-black tones maximize contrast so spectrum colors appear to emit light rather than sit on a surface.

| Token | Hex | Usage |
|---|---|---|
| `--prism-void` | `#08060e` | Deepest background, app shell |
| `--prism-deep` | `#0c0a14` | Primary panel backgrounds |
| `--prism-surface` | `#12101c` | Card/container surfaces |
| `--prism-elevated` | `#1a1726` | Elevated panels, modals |
| `--prism-overlay` | `#221e30` | Hover states, overlays |

### 1.2 Spectral Primaries (The Refracted Spectrum)

Colors follow the physical order of light through a prism: red → orange → yellow → green → cyan → blue → violet. Each color has a luminous quality — saturated but not neon-harsh.

| Token | Hex | Role |
|---|---|---|
| `--spectrum-red` | `#ff3355` | Destructive actions, critical alerts |
| `--spectrum-orange` | `#ff8833` | Warnings, energy indicators |
| `--spectrum-yellow` | `#ffcc22` | Highlights, active focus |
| `--spectrum-green` | `#33ff88` | Success, healthy states |
| `--spectrum-cyan` | `#22eeff` | Links, interactive elements |
| `--spectrum-blue` | `#3366ff` | Primary actions, selected states |
| `--spectrum-violet` | `#9944ff` | Accent, premium indicators |
| `--spectrum-magenta` | `#ff44cc` | Secondary accent, notifications |
| `--spectrum-pink` | `#ff77aa` | Soft accent, favorites |

### 1.3 Holographic Gradients

These are not flat gradients but spectral sweeps that suggest light passing through glass.

```css
/* Primary rainbow sweep — used on active borders, progress bars */
--gradient-spectrum: linear-gradient(
  90deg,
  #ff3355 0%,
  #ff8833 14%,
  #ffcc22 28%,
  #33ff88 42%,
  #22eeff 57%,
  #3366ff 71%,
  #9944ff 85%,
  #ff44cc 100%
);

/* Subtle iridescent — used on panel borders, card edges */
--gradient-iridescent: linear-gradient(
  135deg,
  rgba(255,51,85,0.15) 0%,
  rgba(255,204,34,0.1) 25%,
  rgba(34,238,255,0.15) 50%,
  rgba(153,68,255,0.1) 75%,
  rgba(255,68,204,0.15) 100%
);

/* Vertical aurora — used on backgrounds, ambient lighting */
--gradient-aurora: linear-gradient(
  180deg,
  rgba(51,102,255,0.08) 0%,
  rgba(34,238,255,0.06) 20%,
  rgba(51,255,136,0.04) 40%,
  transparent 60%,
  rgba(153,68,255,0.04) 80%,
  rgba(255,68,204,0.06) 100%
);

/* Diagonal prismatic — used on holographic card overlays */
--gradient-prismatic: linear-gradient(
  115deg,
  transparent 0%,
  rgba(255,204,34,0.03) 20%,
  rgba(34,238,255,0.05) 40%,
  rgba(153,68,255,0.03) 60%,
  rgba(255,68,204,0.04) 80%,
  transparent 100%
);
```

### 1.4 Text Colors

| Token | Hex | Usage |
|---|---|---|
| `--prism-text-primary` | `#e8e4f0` | Primary body text — warm white with faint violet tint |
| `--prism-text-secondary` | `#9a94a8` | Secondary labels, metadata |
| `--prism-text-muted` | `#5c5670` | Disabled text, hints |
| `--prism-text-bright` | `#ffffff` | Maximum emphasis headings |

### 1.5 Border & Separator Colors

| Token | Hex | Usage |
|---|---|---|
| `--prism-border` | `rgba(255,255,255,0.06)` | Default panel borders |
| `--prism-border-active` | `rgba(34,238,255,0.3)` | Active/focused borders |
| `--prism-border-iridescent` | Uses `--gradient-iridescent` | Special holographic borders |

---

## 2. Surfaces & Materials

### 2.1 Holographic Glass

Primary panel material. Translucent dark surfaces with a faint prismatic sheen visible on edges and during hover.

```css
.prism-glass {
  background: rgba(12, 10, 20, 0.85);
  backdrop-filter: blur(16px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  /* Faint iridescent inner glow */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 -1px 0 rgba(153, 68, 255, 0.03);
}
```

### 2.2 Prismatic Panels

Elevated containers with visible spectrum edge lighting. Used for modals, settings, and prominent cards.

```css
.prism-panel {
  background: linear-gradient(
    170deg,
    rgba(18, 16, 28, 0.95) 0%,
    rgba(12, 10, 20, 0.98) 100%
  );
  border: 1px solid transparent;
  /* Rainbow border via background-clip trick */
  background-clip: padding-box;
  border-image: var(--gradient-spectrum) 1;
  border-image-slice: 1;
  box-shadow:
    0 0 20px rgba(34, 238, 255, 0.05),
    0 0 40px rgba(153, 68, 255, 0.03);
}
```

### 2.3 Iridescent Cards

File cards and interactive containers. Surface shifts color subtly based on mouse position (calculated via CSS custom properties set by JS).

```css
.prism-card {
  background: rgba(18, 16, 28, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.05);
  position: relative;
  overflow: hidden;
}

/* Holographic shimmer overlay — position shifts with mouse */
.prism-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    calc(105deg + var(--mouse-angle, 0deg)),
    transparent 30%,
    rgba(34, 238, 255, 0.04) 42%,
    rgba(255, 204, 34, 0.03) 48%,
    rgba(153, 68, 255, 0.04) 54%,
    transparent 70%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.prism-card:hover::after {
  opacity: 1;
}
```

### 2.4 Translucent Color Fields

Used for status backgrounds, category indicators, and subtle section tinting. These are not solid fills but transparent washes of spectrum color.

```css
/* Example: success field */
.prism-field-success {
  background: rgba(51, 255, 136, 0.06);
  border-left: 2px solid rgba(51, 255, 136, 0.4);
}

/* Example: warning field */
.prism-field-warning {
  background: rgba(255, 136, 51, 0.06);
  border-left: 2px solid rgba(255, 136, 51, 0.4);
}
```

### 2.5 Liquid Light Textures

Animated gradient surfaces used sparingly for premium elements (vault unlock screen, health score ring, backup progress).

```css
@keyframes liquid-spectrum {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.prism-liquid {
  background: linear-gradient(
    270deg,
    #ff3355, #ff8833, #ffcc22,
    #33ff88, #22eeff, #3366ff,
    #9944ff, #ff44cc, #ff3355
  );
  background-size: 400% 100%;
  animation: liquid-spectrum 8s ease-in-out infinite;
}
```

---

## 3. Lighting Behavior

### 3.1 Prismatic Edge Glows

Active elements emit a soft multi-color glow along their edges. The glow is not a single color but a compressed rainbow.

```css
.prism-glow-active {
  box-shadow:
    0 0 8px rgba(34, 238, 255, 0.3),
    0 0 16px rgba(153, 68, 255, 0.15),
    0 0 24px rgba(255, 68, 204, 0.08);
}
```

### 3.2 Spectrum Gradient Movement

Borders and progress indicators feature a slowly animating rainbow gradient that gives the impression of light flowing through the element.

```css
@keyframes spectrum-flow {
  0% { background-position: 0% center; }
  100% { background-position: 200% center; }
}

.prism-border-animated {
  border-image: linear-gradient(
    90deg,
    #ff3355, #ffcc22, #33ff88,
    #22eeff, #9944ff, #ff44cc, #ff3355
  ) 1;
  animation: spectrum-flow 6s linear infinite;
  background-size: 200% 100%;
}
```

### 3.3 Chromatic Bloom

Active and focused elements produce a soft chromatic bloom — a radial glow that fades through 2-3 spectrum colors outward.

```css
.prism-bloom {
  filter: drop-shadow(0 0 6px rgba(34, 238, 255, 0.4))
          drop-shadow(0 0 12px rgba(153, 68, 255, 0.2))
          drop-shadow(0 0 20px rgba(255, 68, 204, 0.1));
}
```

### 3.4 Light Diffusion on Panels

Panel backgrounds include a subtle radial gradient centered on the cursor position (updated via JS), simulating light hitting a translucent surface.

```css
.prism-panel-lit {
  background: radial-gradient(
    600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(34, 238, 255, 0.04) 0%,
    rgba(153, 68, 255, 0.02) 30%,
    transparent 60%
  );
}
```

### 3.5 Holographic Reflections

Cards and elevated surfaces show a diagonal light band that shifts position on hover, simulating a holographic foil effect.

The band travels from bottom-left to top-right as the mouse moves across the element. It contains compressed spectrum colors (cyan → yellow → magenta) in a narrow strip.

---

## 4. Background Environment

### 4.1 Composition

The background is a deep void (`#08060e`) layered with multiple subtle effects:

**Layer 1 — Aurora Gradient (Static)**
A large, soft, slowly-shifting gradient in the upper portion of the screen. Colors: deep blue → cyan → faint green. Opacity: 4-8%. Creates atmospheric depth without distraction.

**Layer 2 — Spectrum Particles (Animated)**
Tiny dots of various spectrum colors drift slowly upward. Each particle is a single color from the spectrum palette. Size: 1-3px. Opacity: 10-30%. Count: 30-50 particles. Speed: very slow (40-80s per full traversal). Creates a cosmic, suspended-in-light feeling.

**Layer 3 — Prismatic Light Streaks (Animated)**
2-3 very faint diagonal lines of rainbow gradient that slowly drift across the background. Width: 1-2px, heavily blurred (20-40px blur radius). Opacity: 3-5%. These resemble distant light beams passing through the environment.

**Layer 4 — Nebula Color Clouds (Static/Slow)**
2-3 large, extremely soft radial gradients placed asymmetrically. Colors: violet, cyan, magenta at 2-4% opacity. Radius: 300-600px. These create subtle color zones in the background, like distant nebulae.

**Layer 5 — Holographic Wave (Optional, Animated)**
A very faint sine-wave-shaped band of rainbow gradient that slowly oscillates vertically. Opacity: 2-3%. Creates a gentle, living quality to the background.

### 4.2 Key Principles

- Background must never compete with foreground content
- Total combined background opacity should not exceed 10-12%
- Movement should be imperceptible at first glance — noticed only when watching
- Deep dark foundation must remain dominant

---

## 5. Motion Language

### 5.1 Core Principles

All animation feels like light moving through a medium — fluid, radiant, and continuous. No hard stops, no glitch effects, no mechanical jerks.

- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` for most transitions. Ease-out dominant.
- **Duration:** 200-400ms for micro-interactions, 600-1200ms for ambient effects
- **Feel:** Flowing water, bending light, gentle waves

### 5.2 Animation Catalog

**Rainbow Light Sweep**
A diagonal band of compressed rainbow slides across an element from left to right. Used on: first render of cards, successful actions, progress completion.
- Duration: 600ms
- Width of band: ~30% of element width
- Opacity: 8-12%
- Easing: ease-in-out

**Iridescent Hover Shift**
On hover, the holographic overlay shifts its angle and color emphasis based on cursor position. The dominant visible color changes smoothly (cyan when cursor is left, yellow at center, magenta at right).
- Transition: 150ms position tracking
- Color shift: continuous, mapped to mouse X

**Color Ripple**
On click, a circular ripple expands from the click point. The ripple edge is a thin rainbow gradient ring that fades as it expands.
- Duration: 400ms
- Max radius: 120% of element size
- Easing: ease-out
- Edge: 2px rainbow gradient, 0→15% opacity → 0

**Prismatic Burst**
On significant actions (unlock, backup complete, import finish), a radial burst of 6-8 small colored lines expands outward from the action point, each a different spectrum color.
- Duration: 500ms
- Line length: 20-40px
- Spread angle: 360° evenly distributed
- Each line is a different spectrum color
- Fade out with scale

**Flowing Gradient Movement**
Active/selected element borders feature a slowly rotating rainbow gradient. The gradient appears to flow clockwise around the border.
- Duration: 4-6s per full rotation
- Technique: animated `conic-gradient` or SVG animated stroke

**Spectrum Pulse**
Notification badges and status indicators emit a gentle outward pulse of their spectrum color.
- Duration: 2s per cycle
- Scale: 1→1.5
- Opacity: 40%→0%
- Continuous while visible

**Smooth Color Blending**
When transitioning between states (e.g., switching tabs, changing categories), colors blend smoothly through intermediate spectrum values rather than snapping.
- Duration: 300ms
- Technique: CSS `transition` on all color properties
- Colors travel through the spectrum (red → orange → yellow, not red → yellow directly)

**Particle Trails**
Dragged elements leave a trail of 3-5 small colored dots that fade after 400ms. Each dot is a successive spectrum color.

---

## 6. Interaction Feedback

### 6.1 Hover

- **Cards:** Holographic shimmer overlay appears (iridescent gradient shifts with cursor position). Border brightens to `rgba(255,255,255,0.1)`. Subtle lift (`translateY(-2px)`).
- **Buttons:** Background shifts to a translucent version of the button's spectrum color. Border gains a faint chromatic glow.
- **List items:** Left border appears as a thin rainbow gradient line. Background gains a `rgba(255,255,255,0.02)` tint.
- **Icons:** Gain a soft chromatic bloom (multi-color drop shadow).

### 6.2 Click / Press

- **Color ripple** emanates from click point (see Motion section).
- Element scales to 0.97 then back to 1.0 over 200ms.
- A brief flash of white (5% opacity, 100ms) simulates light impact.

### 6.3 Selection

- Selected elements gain a flowing rainbow border (animated conic gradient).
- Background shifts to a deep translucent version of the primary spectrum color.
- Small prismatic sparks appear at element corners (4 small dots in different spectrum colors that expand outward and fade).

### 6.4 Activation / Confirmation

- **Success:** Radiant green-cyan pulse expands outward. A brief rainbow sweep crosses the element.
- **Error:** Red-orange pulse. Element border briefly flashes red.
- **Warning:** Amber pulse with a single gentle shake (2px horizontal, 200ms).

### 6.5 Focus

- Focused elements receive a soft multi-color glow ring (`box-shadow` with cyan, violet, and magenta layers).
- The glow subtly breathes (opacity oscillates between 60% and 100% over 2s).

---

## 7. Typography

### 7.1 Font Selection

| Role | Font | Fallback | Weight |
|---|---|---|---|
| Display/Headings | `'Inter'` | `system-ui, sans-serif` | 600-700 |
| Body | `'Inter'` | `system-ui, sans-serif` | 400 |
| Monospace/Data | `'JetBrains Mono'` | `'Fira Code', monospace` | 400 |

Inter is chosen for its geometric clarity, excellent readability at small sizes, and neutral character that won't compete with the vibrant color system. It has a slightly futuristic quality without being aggressively sci-fi.

### 7.2 Type Scale

| Level | Size | Weight | Letter-spacing | Color |
|---|---|---|---|---|
| H1 | 24px | 700 | 0.08em | `--prism-text-bright` |
| H2 | 18px | 600 | 0.06em | `--prism-text-bright` |
| H3 | 14px | 600 | 0.05em | `--prism-text-primary` |
| Body | 13px | 400 | 0 | `--prism-text-primary` |
| Caption | 11px | 400 | 0.02em | `--prism-text-secondary` |
| Micro | 10px | 400 | 0.04em | `--prism-text-muted` |
| Mono | 12px | 400 | 0 | `--prism-text-secondary` |

### 7.3 Heading Accents

Section headings can incorporate a subtle spectrum underline or a faint prismatic glow on the first letter, but body text remains clean and unadorned.

```css
.prism-heading {
  color: var(--prism-text-bright);
  text-shadow: 0 0 30px rgba(34, 238, 255, 0.15);
  /* Optional: spectrum underline */
  border-bottom: 1px solid transparent;
  border-image: var(--gradient-spectrum) 1;
  border-image-slice: 1;
  padding-bottom: 4px;
}
```

---

## 8. Component Aesthetics

### 8.1 Buttons

**Primary Button**
```
┌─────────────────────────────────┐
│  ░░░ IMPORT FILES ░░░          │ ← Spectrum gradient border (animated flow)
│                                 │ ← Dark translucent fill
└─────────────────────────────────┘
  ↑ Soft prismatic glow beneath
```

- Background: `rgba(34, 238, 255, 0.08)` (primary color wash)
- Border: 1px animated rainbow gradient
- Text: `--prism-text-bright`
- Hover: Background brightens to 12%, glow intensifies, shimmer overlay appears
- Active: Scale 0.97, brief white flash
- Glow: `box-shadow: 0 4px 15px rgba(34, 238, 255, 0.15)`

**Secondary Button**
- Background: transparent
- Border: 1px `rgba(255,255,255,0.08)`
- Hover: Border shifts to iridescent gradient, faint spectrum glow
- Active: Color ripple from click point

**Destructive Button**
- Same structure as primary but spectrum anchored to red-orange range
- Glow shifts to warm spectrum only

### 8.2 Cards & Panels

**File Card**
```
┌──────────────────────────────┐
│ ╭──────────────────────────╮ │ ← Outer: spectrum border (visible on select)
│ │                          │ │
│ │      [Icon/Thumb]        │ │ ← Holographic shimmer on hover
│ │                          │ │
│ ├──────────────────────────┤ │
│ │ filename.ext             │ │
│ │ 2.4 MB    •    PNG       │ │
│ ╰──────────────────────────╯ │
└──────────────────────────────┘
   ↑ Prismatic edge light on hover
```

- Default: `prism-glass` material, near-invisible border
- Hover: Holographic overlay shifts with mouse, border brightens, 2px lift
- Selected: Animated rainbow border, `prism-glow-active` shadow, corner sparks on selection change
- Thumbnail area: Faint radial gradient of the file's category color at 5% opacity

**Modal/Settings Panel**
- `prism-panel` material with visible spectrum border
- Header has a faint horizontal rainbow gradient line beneath
- Sections separated by `rgba(255,255,255,0.03)` dividers
- Close button: Hover triggers rotation + chromatic bloom

### 8.3 Tabs & Navigation

**Tab Bar**
```
  Files    Settings    Audit     Integrity
  ─────   ────────    ─────     ─────────
   ╰── Active: rainbow gradient underline (2px, animated flow) ──╯
```

- Inactive tabs: `--prism-text-muted`
- Hover: Text shifts to `--prism-text-primary`, faint spectrum underline appears
- Active: Text is `--prism-text-bright`, 2px rainbow gradient underline with flowing animation
- Transition between tabs: The underline slides to the new position while its colors shift through the spectrum

**Category Filter Pills**
- Default: Dark translucent pill, muted text
- Hover: Border gains iridescent tint
- Active: Filled with category's spectrum color at 15%, text bright, prismatic glow

### 8.4 Notifications

```
╭────────────────────────────────────────╮
│  ◉  3 files imported successfully      │ ← Radiant glow outline
│     ──────────────────────────         │ ← Expanding color ring on appear
╰────────────────────────────────────────╯
```

- Background: `prism-glass` material
- Border: 1px of the notification's severity color (green/amber/red) with a soft glow
- Entry animation: Slides in from right + expanding spectrum ring from the icon
- Exit: Fades while a brief rainbow sweep crosses left-to-right
- Success: Green-cyan glow
- Warning: Orange-yellow glow
- Error: Red-magenta glow

### 8.5 Status Indicators

**Health Score Ring**
- SVG circle with `stroke` set to a conic gradient cycling through the full spectrum
- The fill percentage determines how much of the rainbow is visible
- Gentle rotation animation (20s per revolution) makes the colors appear to flow
- Center text shows the score in `--prism-text-bright`

**File Category Badges**
Each category gets a specific spectrum zone:
- Images: `--spectrum-magenta` to `--spectrum-pink`
- Videos: `--spectrum-violet` to `--spectrum-blue`
- Audio: `--spectrum-green` to `--spectrum-cyan`
- Documents: `--spectrum-cyan` to `--spectrum-blue`
- Archives: `--spectrum-orange` to `--spectrum-yellow`

Badge is a small pill with the category's spectrum gradient as a border and color-washed background.

**Progress Bars**
- Track: `rgba(255,255,255,0.04)` rounded bar
- Fill: Animated `--gradient-spectrum` (flows left to right as progress increases)
- Head: Small bright dot at the progress point with chromatic bloom

**Online/Activity Dots**
- Spectrum color dots with a soft pulsing halo
- The halo cycles through 2-3 adjacent spectrum colors

---

## 9. Special Visual Effects

### 9.1 Prism Light Splitting

Used on the vault unlock animation. A single white light beam enters from the left, hits a triangular prism shape at center, and splits into the full spectrum fanning out to the right. Each color beam continues to the right edge of the screen.

- Duration: 1200ms
- The prism is a translucent triangle with iridescent edges
- Beams fan out at 5° increments
- Each beam is 2px wide with 10px blur
- After splitting, beams briefly flash brighter then settle to 20% opacity

### 9.2 Holographic Shimmer

Applied to cards and premium surfaces. A narrow band of compressed rainbow (15% width of element) sweeps diagonally across the surface.

- Triggered by: hover, first render, state change
- Duration: 600ms
- Angle: 115° (upper-left to lower-right)
- Colors in band: cyan → yellow → magenta (compressed spectrum)
- Opacity: 4-8%

### 9.3 Aurora Gradient Background

The primary ambient background effect. Soft, large-scale color washes that slowly shift position and hue.

- 3 overlapping radial gradients
- Colors: Blue-cyan (top-left), Green-cyan (center-right), Violet-magenta (bottom-left)
- Each gradient: 400-700px radius, 3-6% opacity
- Movement: Each drifts in a slow circular path (60-90s period)
- Never crosses above 8% opacity to maintain readability

### 9.4 Chromatic Particle Trails

When files are dragged or during batch operations, small spectrum-colored particles trail behind the action.

- Particle count: 5-8 per trail
- Each particle is a different spectrum color
- Size: 2-4px circles
- Lifetime: 400ms
- Fade: opacity 80% → 0%
- Slight upward drift as they fade

### 9.5 Iridescent Reflections

On scroll, panels and cards show a brief horizontal light band that moves in the opposite direction of scroll, simulating a reflective surface.

- Band width: 100% of element, 4px height
- Color: White at 3% opacity with faint rainbow fringe
- Duration: proportional to scroll speed
- Direction: opposite to scroll direction

### 9.6 Light Beam Transitions

Page/view transitions use expanding light beams. When switching from login to vault:

- 6-8 beams of different spectrum colors expand radially from center
- Duration: 500ms
- Beams rotate slightly as they expand (15° total)
- Old view fades behind the beams
- New view fades in as beams reach edges and dissolve

### 9.7 Spectral Lens Flare

On significant events (vault unlock, backup complete), a brief lens flare appears:

- Hexagonal shape with rainbow edges
- 2-3 secondary flare dots along a diagonal
- Each flare dot is a different spectrum color
- Total duration: 800ms
- Opacity: 15% peak, smooth fade

---

## 10. CSS Variable Map for Implementation

```css
[data-theme="rainbow"] {
  /* Backgrounds */
  --color-cyber-black: #08060e;
  --color-cyber-panel: #12101c;
  --color-cyber-border: rgba(255, 255, 255, 0.06);

  /* Primary spectrum (cyan as primary action color) */
  --color-neon-primary: #22eeff;
  --color-neon-bright: #ffffff;
  --color-neon-dark: rgba(34, 238, 255, 0.4);
  --color-neon-subtle: rgba(34, 238, 255, 0.06);
  --color-neon-glow: rgba(34, 238, 255, 0.15);

  /* Text */
  --color-cyber-text: #e8e4f0;
  --color-cyber-muted: #9a94a8;

  /* Spectrum accents (available for components) */
  --spectrum-red: #ff3355;
  --spectrum-orange: #ff8833;
  --spectrum-yellow: #ffcc22;
  --spectrum-green: #33ff88;
  --spectrum-cyan: #22eeff;
  --spectrum-blue: #3366ff;
  --spectrum-violet: #9944ff;
  --spectrum-magenta: #ff44cc;
  --spectrum-pink: #ff77aa;
}
```

---

## 11. Theme Mode Integration

The rainbow theme maps to theme mode `"prismatic"` in the existing `useThemeMode` system. When `data-theme="rainbow"` is set:

- Background effects switch to: Aurora gradient + Spectrum particles + Prismatic light streaks
- Card holographic overlay uses full-spectrum shimmer instead of single-color
- Selection effects use rainbow sparks instead of single-color sparks
- All `var(--color-neon-*)` tokens resolve to the cyan-anchored spectrum palette
- DiagBot health ring uses animated spectrum gradient stroke
- Progress bars use flowing rainbow fill
- The unlock burst effect becomes the prism light-splitting animation

---

## 12. Accessibility Considerations

- All spectrum colors maintain WCAG AA contrast ratio (4.5:1) against `--prism-void` background
- Rainbow gradients on borders are decorative only — never the sole indicator of state
- Text never uses rainbow gradients — always solid, readable colors
- Motion effects respect `prefers-reduced-motion`: all animations pause, gradients become static
- Focus indicators use a high-contrast white ring in addition to chromatic glow for visibility
- Color-blind safe: States are always communicated through shape, position, or text in addition to color

---

## Summary

The Prismatic theme transforms Kawaii Vault into a system that feels like it's built from refracted light. Every surface is a translucent lens. Every interaction bends the spectrum. The deep void background makes colors appear self-luminous. Motion is fluid and radiant — light flowing through glass, not electricity through circuits.

The result: a prismatic operating system made of shifting light, holographic energy, and flowing color spectra.
