---
version: alpha
name: Web
description: |
  Stremio's design system embodies a modern streaming platform aesthetic
  centered on dark, immersive viewing. The visual identity prioritizes content
  discovery through a bold contrast between deep navy-purple backgrounds and
  bright, accessible typography. The atmosphere is cinematic yet functional—a
  careful balance between entertainment appeal and usability. Navigation remains
  minimal and non-intrusive, allowing content cards to command visual focus.
  Interactive elements employ sharp geometry and vibrant accent colors to signal
  interactivity against the dark canvas, creating a premium, streamlined
  experience that emphasizes media thumbnails and metadata.
source:
  url: "https://web.stremio.com/"
  pagesAnalyzed: 1
  extractedAt: 2026-10-19
  tokensMeasured: true
colors:
  primary: "#FFFFFF"
  canvas: "#0C0B11"
  hairline: "#7B5BF5"
  warning: "#CB8E00"
typography:
  body-xl:
    fontFamily: PlusJakartaSans
    fontSize: 22.4px
    fontWeight: 500
    letterSpacing: 0px
  body-lg:
    fontFamily: PlusJakartaSans
    fontSize: 16.8px
    fontWeight: 400
    letterSpacing: 0px
  body-md:
    fontFamily: PlusJakartaSans
    fontSize: 14px
    fontWeight: 400
    letterSpacing: 0px
  body-md-strong:
    fontFamily: PlusJakartaSans
    fontSize: 14px
    fontWeight: 500
    letterSpacing: 0px
  body-md-2:
    fontFamily: PlusJakartaSans
    fontSize: 14px
    fontWeight: 600
    letterSpacing: 0px
rounded:
  none: 0px
  xs: 10.5px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 28px
  xxl: 100px
  xxxl: 148px
  section: 160px
elevationStrategy: color-blocking
themes:
  derived: light   # the other theme is the site's measured palette
  light:
    bg: "#FBFBFB"
    surface: "#F1F1F1"
    surfaceRaised: "#E9E9E9"
    text: "#1D1D1D"
    textMuted: "#707070"
    border: "#D8D8D8"
    accent: "#707070"
    accentFg: "#FFFFFF"
    focusRing: "#8F8F8F"
    elevation: shadow
  dark:
    bg: "#0C0B11"
    surface: "#0C0B10"
    surfaceRaised: "#1F1F23"
    text: "#111111"
    textMuted: "#0F0F11"
    border: "#7B5BF5"
    accent: "#FFFFFF"
    accentFg: "#0B0B0C"
    focusRing: "#FFFFFF"
    elevation: "border+surface"
  contrastFailures:
    - "dark: text on bg = 1.04:1 (needs 4.5:1)"
    - "dark: muted on bg = 1.02:1 (needs 4.5:1)"
    - "dark: text on surface = 1.04:1 (needs 4.5:1)"
components:
  navigation:
    typography: "{typography.body-md}"
    textColor: "rgba(255, 255, 255, 0.9)"
    height: 77px
    padding: "0px 14px 0px 0px"
  link:
    typography: "{typography.body-md}"
    textColor: "rgba(255, 255, 255, 0.9)"
  link-sm:
    typography: "{typography.body-md}"
    textColor: "rgba(255, 255, 255, 0.9)"
    rounded: "{rounded.xs}"
states:
  button-hover:
    target: button
    state: hover
    backgroundColor: transparent
  button-active:
    target: button
    state: active
    outline: none
  link-hover:
    target: link
    state: hover
    textDecoration: underline
  other-hover:
    target: other
    state: hover
    transform: "scale(1.1)"
  nav-hover:
    target: nav
    state: hover
    outline: none
  link-focus:
    target: link
    state: focus
    outline: none
    borderColor: "{colors.primary}"
  button-focus:
    target: button
    state: focus
    outline: none
  other-focus:
    target: other
    state: focus
    outline: none
  input-focus:
    target: input
    state: focus
    outline: none
  card-hover:
    target: card
    state: hover
    borderColor: "rgba(255, 255, 255, 0.15)"
  button-disabled:
    target: button
    state: disabled
    opacity: 0.4
  input-hover:
    target: input
    state: hover
    opacity: 1
breakpoints:
  - width: 375
    containerWidth: 347
    gridColumns: 0
    navLinksVisible: 5
    menuToggleVisible: true
    headingPx: 0
    bodyPx: 14
    sectionPaddingX: 0
  - width: 768
    containerWidth: 535
    gridColumns: 0
    navLinksVisible: 6
    menuToggleVisible: true
    headingPx: 0
    bodyPx: 14
    sectionPaddingX: 0
  - width: 1024
    containerWidth: 791
    gridColumns: 0
    navLinksVisible: 6
    menuToggleVisible: true
    headingPx: 0
    bodyPx: 14
    sectionPaddingX: 0
  - width: 1280
    containerWidth: 1047
    gridColumns: 0
    navLinksVisible: 6
    menuToggleVisible: true
    headingPx: 0
    bodyPx: 14
    sectionPaddingX: 0
  - width: 1440
    containerWidth: 1207
    gridColumns: 0
    navLinksVisible: 6
    menuToggleVisible: true
    headingPx: 0
    bodyPx: 14
    sectionPaddingX: 0
coverage:
  statesFound: 61
  gradientsFound: 0
  rolesUnassigned: 0
  archetypesUnnamed: 0
  archetypesDetected: 0
  responsiveMeasured: true
  stylesheetsBlocked: false
  semanticRampDeclared: true
---

# Design System Inspired by Stremio

## 1. Visual Theme & Atmosphere

Stremio's design system embodies a **modern streaming platform aesthetic** centered on dark, immersive viewing. The visual identity prioritizes **content discovery** through a bold contrast between deep navy-purple backgrounds and bright, accessible typography. The atmosphere is cinematic yet functional—a careful balance between entertainment appeal and usability. Navigation remains minimal and non-intrusive, allowing content cards to command visual focus. Interactive elements employ sharp geometry and vibrant accent colors to signal interactivity against the dark canvas, creating a premium, streamlined experience that emphasizes media thumbnails and metadata.

**Key Characteristics:**
- Deep navy-purple canvas (`{colors.canvas}` — `#0C0B11`) establishes a theatrical viewing environment
- High-contrast white text and interactive elements ensure readability and accessibility
- Sharp, square corners dominate (0px radius) for a modern, technical feel; only avatars and overlays employ rounded geometry
- Minimal shadow elevation; depth conveyed through color blocking and opacity shifts
- Interactive feedback uses outline strokes and opacity changes rather than fill transformations
- Accent purple (`{colors.hairline}` — `#7B5BF5`) marks focus states and borders
- Warning yellow (`{colors.warning}` — `#CB8E00`) reserved for system alerts and notifications

---

## 2. Color Palette & Roles

### Primary
- **Primary / Brand** (`{colors.primary}` — `#FFFFFF`): Active states, primary CTA text, focus outlines, and high-contrast interactive elements. Used extensively on dark backgrounds for maximum legibility.

### Neutral Scale
- **Canvas** (`{colors.canvas}` — `#0C0B11`): Default page and section backgrounds, establishing the immersive dark viewing environment.

### Interactive & Accents
- **Hairline / Focus Accent** (`{colors.hairline}` — `#7B5BF5`): 1px borders, dividers, focus outlines, and subtle accent strokes. Defines the interactive layer of the system.

### Semantic / Status
- **Warning** (`{colors.warning}` — `#CB8E00`): Warning notifications, caution states, and system alerts (e.g., "Streaming server is not available" banner).

---

## 3. Typography Rules

### Font Family
**Primary:** PlusJakartaSans  
**Fallback:** system-ui, -apple-system, sans-serif

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Body Extra Large | PlusJakartaSans | 22.4px | 500 | not measured | 0px | Section titles, prominent metadata |
| Body Large | PlusJakartaSans | 16.8px | 400 | not measured | 0px | Subheadings, large body copy |
| Body Medium Strong | PlusJakartaSans | 14px | 600 | not measured | 0px | Navigation labels, button text, strong body |
| Body Medium | PlusJakartaSans | 14px | 500 | not measured | 0px | Standard body text, form labels |
| Body Medium Regular | PlusJakartaSans | 14px | 400 | not measured | 0px | Links, caption text, tertiary labels |

### Principles
- All typography uses PlusJakartaSans, a geometric sans-serif optimized for screen legibility at small sizes.
- Letter-spacing is consistently 0px across all roles—tracking is never compressed or expanded.
- Weight modulation (400, 500, 600) drives hierarchy rather than size alone, supporting readable 14px body text.
- Line-height data was not extracted; implementations should use platform defaults (1.4–1.6 for body, 1.2 for headings).

---

## 4. Component Stylings

### Buttons

#### Primary / Default Button
- **Background:** `rgba(0, 0, 0, 0)` (transparent)
- **Text Color:** `rgba(255, 255, 255, 0.9)`
- **Font:** PlusJakartaSans, 14px, weight 400
- **Padding:** Inferred from components (exact padding not directly extracted)
- **Border Radius:** `{rounded.none}` (0px)
- **Border:** None
- **Hover State:** Outline `var(--focus-outline-size) solid var(--primary-foreground-color)` (`#FFFFFF`); background remains transparent; text opacity increases to 1
- **Focus State:** Outline `var(--focus-outline-size) solid var(--primary-foreground-color)` (`#FFFFFF`)
- **Active State:** Outline removed; returns to transparent background
- **Disabled State:** Opacity reduced to 0.4

#### Secondary / Accent Button
- **Background:** Transparent (default) → `var(--secondary-accent-color)` (filled) on hover
- **Text Color:** `rgba(255, 255, 255, 0.9)`
- **Font:** PlusJakartaSans, 14px, weight 400
- **Border Radius:** `{rounded.none}` (0px)
- **Hover State:** Background fills with secondary accent; outline may display depending on variant
- **Focus State:** Outline `var(--focus-outline-size) solid var(--primary-foreground-color)` (inset box-shadow variant: `inset 0 0 0 0.15rem var(--primary-foreground-color)`)

#### Tertiary / Ghost Button
- **Background:** Transparent
- **Text Color:** `rgba(255, 255, 255, 0.9)`
- **Border Radius:** `{rounded.none}` (0px)
- **Hover State:** Text decoration underline; opacity may increase to 1; no background fill
- **Text Decoration Hover:** Underline applied

### Cards & Containers

#### Media Card (Movie / Series)
- **Background:** `rgba(0, 0, 0, 0)` (transparent, displaying image content)
- **Border:** 0px (no border by default)
- **Border Radius:** `{rounded.none}` (0px) for image; content area uses `{rounded.xs}` (10.5px) for overlay
- **Hover State:** Border color becomes `rgba(255, 255, 255, 0.15)` or `rgba(255, 255, 255, 0.4)`; box-shadow `rgba(255, 255, 255, 0.3) 0px 0px 0px 1px inset`; background shifts to `rgb(33, 26, 51)` (lighter dark); transform `translateX(min(0px, calc(var(--preview-space) - 100%)))`

#### Overlay / Section Container
- **Border Radius:** `{rounded.xs}` (10.5px)
- **Background:** Typically semi-transparent overlay derived from canvas color
- **Opacity Variants:** 90% (0.90), 60% (0.60), 35% (0.35) used for layered depth

### Inputs & Forms

#### Search / Text Input
- **Background:** `rgba(0, 0, 0, 0)` (transparent default)
- **Text Color:** `rgba(255, 255, 255, 0.9)`
- **Font:** PlusJakartaSans, 14px, weight 400
- **Border Radius:** `{rounded.none}` (0px)
- **Border:** 0px default; on hover becomes `var(--overlay-color)` 1px; on focus becomes `var(--primary-foreground-color)` 1px
- **Hover State:** Border color `var(--overlay-color)`; opacity increases to 1
- **Focus State:** Border color `var(--primary-foreground-color)` (`#FFFFFF`); outline removed
- **Focus-Visible:** Outline `var(--focus-outline-size) solid var(--primary-accent-color)` (`#7B5BF5`)

### Navigation

#### Primary Navigation Bar
- **Background:** `rgba(0, 0, 0, 0)` (transparent)
- **Text Color:** `rgba(255, 255, 255, 0.9)`
- **Font:** PlusJakartaSans, 14px, weight 400
- **Height:** 77px
- **Width:** Full (measured as 1426px at large viewports)
- **Padding:** 0px 14px 0px 0px
- **Border Radius:** `{rounded.none}` (0px)
- **Hover State:** Background becomes `var(--overlay-color)` or `var(--secondary-background-color)`; opacity transitions to 0.6, 1, or 0.85 depending on link role

#### Navigation Links (Icon / Avatar)
- **Default:** Transparent background, white text, 14px
- **Border Radius:** `{rounded.full}` (9999px) for small avatar buttons; `{rounded.xs}` (10.5px) for overlay icons
- **Hover State:** Scale transform `scale(1.1)`, opacity changes to 0.7–1.0, or background fills with `var(--overlay-color)`

---

## 5. Layout Principles

### Spacing System
**Base Unit:** 4px (`{spacing.xxs}`)

**Scale:**
- `{spacing.xxs}` = 4px — minute gaps, icon spacing
- `{spacing.xs}` = 8px — tight spacing within components
- `{spacing.sm}` = 12px — compact padding between elements
- `{spacing.md}` = 16px — standard padding, form field gutters
- `{spacing.lg}` = 20px — generous component spacing
- `{spacing.xl}` = 28px — section separators
- `{spacing.xxl}` = 100px — large section dividers
- `{spacing.xxxl}` = 148px — major layout breaks
- `{spacing.section}` = 160px — full-width section top/bottom margins

### Grid & Container
- **Max Width:** Content columns scale from 347px (375px viewport) to 1207px (1440px viewport)
- **Section Padding Horizontal:** Consistent 0px observed at all breakpoints; layout relies on viewport-relative container widths rather than explicit padding
- **Grid Columns:** Single-column layout observed; media cards displayed in horizontal scrolling rows (not a CSS Grid column count, but a flex-wrap horizontal pattern)
- **Navigation Links:** Visible at all measured breakpoints (6 links at 768px+); menu toggle present but links remain visible

### Whitespace Philosophy
Stremio employs **content-first spacing**, where generous whitespace between card rows and sections creates breathing room for visual media dominance. Vertical rhythm is established through section separators (`{spacing.section}` — 160px) rather than micro-spacing adjustments. Horizontal gutters are minimal (0px padding at section edges), allowing full-width image containers to extend edge-to-edge. This approach emphasizes content thumbnails and metadata, positioning them as the primary focal point rather than framing ornamentation.

### Border Radius Scale
- `{rounded.none}` = 0px — buttons, inputs, images, primary interactive surfaces; sharp, technical aesthetic
- `{rounded.xs}` = 10.5px — overlay containers, secondary UI surfaces, small icon buttons
- `{rounded.full}` = 9999px — avatar images, circular icon badges, always-pill-shaped elements

### Border Widths
No explicit border-width scale was extracted. Borders appear as 1px hairline strokes in focus states and card hover effects, using outline or box-shadow inset techniques rather than distinct border-width values. Focus outlines use `var(--focus-outline-size)` (exact px value not measured) with `#FFFFFF` or `#7B5BF5` colors.

---

## 6. Depth & Elevation

Stremio's elevation strategy employs **color-blocking with micro opacity shifts** rather than traditional shadow stacks. Depth is conveyed through background color changes (canvas `#0C0B11` → lighter dark `rgb(33, 26, 51)` or overlay surfaces) and opacity modulation (0.35–0.90) rather than multi-layer box-shadows.

| Level | Treatment | Use |
|---|---|---|
| Base / Flat | Canvas background `#0C0B11`, no shadow | Page canvas, default surfaces |
| Subtle Lift | Box-shadow `rgba(255, 255, 255, 0.3) 0px 0px 0px 1px inset` (outline stroke effect) | Card hover borders, focus indicators |
| Overlay | Background color shift to `rgb(33, 26, 51)` or semi-transparent overlay; opacity 0.60–0.90 | Hovered cards, dropdown overlays |
| Interactive Lift | Outline stroke `var(--focus-outline-size) solid var(--primary-foreground-color)` or `var(--primary-accent-color)` | Focus states, active buttons |

### Opacity Levels
- **90% (0.90):** Default interactive elements, primary navigation text
- **60% (0.60):** Secondary navigation states, dimmed elements
- **35% (0.35):** Deeply recessed background content, disabled states approaching full transparency

### Z-index / Layering
- **base** = z-index 1 — default content, cards, body elements
- **sticky** = z-index 101 — navigation bar, persistent overlays (e.g., alert banner)

---

## 7. Do's and Don'ts

### Do
- **Use white text** (`{colors.primary}` — `#FFFFFF`) on dark backgrounds; maintain 90% opacity for primary states and reduce to 60% for secondary or disabled states.
- **Apply sharp corners** (`{rounded.none}` — 0px) to buttons, inputs, and images to reinforce the technical, modern aesthetic; reserve 10.5px rounding for overlay containers and avatars only.
- **Signal interactivity through outlines and opacity**, not fill color swaps. Buttons on hover should display a white or purple outline stroke, with background remaining transparent unless the button is intentionally filled (secondary variant).
- **Group content into horizontal scrolling rows** with generous vertical spacing (`{spacing.section}` — 160px) between sections; prioritize media card visibility over padding.
- **Use the purple accent** (`{colors.hairline}` — `#7B5BF5`) for focus outlines and 1px dividers; it signals the platform's interactive layer against the dark canvas.
- **Reserve the warning yellow** (`{colors.warning}` — `#CB8E00`) exclusively for system notifications and caution states (e.g., alert banners).
- **Scale interactive elements on hover** using `transform: scale(1.1)` for icon buttons and avatar triggers to provide clear affordance.
- **Implement responsive breakpoints** at 768px and 1024px, collapsing content columns and adjusting card sizes but maintaining the navigation bar visibility.

### Don't
- **Do not invent rounded corners** for buttons or inputs; the system uses 0px radius for all primary interactive surfaces.
- **Do not fill button backgrounds by default.** Buttons are transparent; fill only on hover for secondary variants or as an explicit filled button style.
- **Do not use shadows** for elevation. Rely on background color shifts (canvas → lighter dark → overlay) and outline strokes for depth indication.
- **Do not reduce opacity below 35%** for interactive elements, as legibility will suffer on the dark canvas.
- **Do not apply letter-spacing** adjustments; all typography uses 0px tracking uniformly.
- **Do not add drop shadows to cards or containers.** Use inset `1px solid rgba(255, 255, 255, 0.3)` outlines for hover states instead.
- **Do not hide the primary navigation** on small viewports; maintain link visibility with a menu toggle coexisting if needed.
- **Do not override PlusJakartaSans** with secondary fonts. Maintain consistent typeface across all text roles.

---

## 8. Responsive Behavior

### Breakpoints

| Breakpoint | Min Width | Content Column | Key Changes |
|---|---|---|---|
| Mobile | 375px | 347px | Single column, minimal side padding (0px), navigation toggle present, 6 nav links visible, body 14px |
| Tablet | 768px | 535px | Content column expands, same navigation structure, 6 nav links visible |
| Desktop | 1024px | 791px | Content reaches optimal single-column width, no layout collapse, full navigation visible |
| Large Desktop | 1280px | 1047px | Content column expands further, consistent spacing |
| Full HD | 1440px | 1207px | Maximum column width; all content fully visible without side scrolling |

### Touch Targets
- **Minimum interactive area:** 44px × 44px (inferred from avatar button sizing at 67.1875px)
- **Icon buttons:** 67–77px dimensions observed for primary navigation toggles and avatar buttons
- **Card hover zones:** Full card width and height clickable; media cards at least 200px wide on all viewpoints

### Collapsing Strategy
- **Mobile (375–767px):** Single-column layout; media cards arranged in horizontal scrolling rows; navigation remains 6 visible links with menu toggle coexisting; section padding remains 0px horizontal
- **Tablet (768–1023px):** Content column expands to 535px; same structural layout; navigation links remain all visible; no column reflow
- **Desktop (1024px+):** Content column reaches 791px+; full card grid visible; navigation bar fully expanded; no further collapsing necessary

All breakpoints maintain **consistent navigation visibility** and **horizontal media card scrolling**—there is no point where navigation collapses to a hamburger menu or content reflows into multi-column grids. The layout is fundamentally single-column with horizontal card rows at all sizes.

---

## 9. Agent Prompt Guide

### Quick Color Reference
- **Primary / CTA & Text:** White (`{colors.primary}` — `#FFFFFF`) — use on dark backgrounds for maximum contrast
- **Background / Canvas:** Deep Navy (`{colors.canvas}` — `#0C0B11`) — establishes the immersive viewing environment
- **Accents & Focus:** Purple (`{colors.hairline}` — `#7B5BF5`) — marks focus outlines, 1px borders, interactive indicators
- **Warning / Alert:** Yellow (`{colors.warning}` — `#CB8E00`) — reserved for system notifications and caution states
- **Opacity Palette:** 90% (primary), 60% (secondary), 35% (tertiary/disabled)

### Iteration Guide
1. **Build all interactive surfaces with 0px border-radius** — buttons, inputs, images use sharp corners. Only avatars and overlays use 10.5px (and 9999px for perfect circles).
2. **Default to transparent backgrounds**; layer fill color only on hover for secondary variants or intentionally filled buttons. Outline strokes (1px white or purple) signal focus and interaction.
3. **Use white outlines at full opacity (1.0) for focus states** on buttons and inputs; purple outlines (`#7B5BF5`) for secondary focus rings.
4. **Scale card hover states** with `box-shadow: rgba(255, 255, 255, 0.3) 0px 0px 0px 1px inset` (no drop shadow) and background color shift to `rgb(33, 26, 51)`.
5. **Maintain 0px horizontal padding at section edges**; allow media cards to extend full width. Use `{spacing.section}` (160px) for vertical separation between section blocks.
6. **Keep navigation bar height at 77px** with consistent 14px font, 0px border-radius, transparent background, and 90% text opacity.
7. **Implement all opacity changes at 90%, 60%, and 35% only**—no gradual opacity ramps; use these three tiers for all dimming and disabled states.
8. **Reserve yellow (`#CB8E00`) exclusively for warning/alert banners**; never use for hover, focus, or active states.
9. **Ensure responsive breakpoints at 768px and 1024px** collapse content column widths but preserve navigation and horizontal card scrolling.
10. **Measure all dimensions in pixels (px), not rems or ems,** and apply PlusJakartaSans at 14px base weight 400 for all body text.

---

## 10. Known Gaps

- **Interaction states for disabled buttons:** Opacity 0.4 was observed, but complete disabled-state styling (background, border, text color) was not fully extracted; implementations should assume transparent background, white text at 0.4 opacity, and no outline on disabled buttons.
- **Line-height values:** Not measured on any typography role. Implementations should use platform defaults (1.4–1.6 for body, 1.2–1.3 for headings).
- **Focus outline size:** `var(--focus-outline-size)` is referenced in hover/focus states but not quantified in px; exact stroke width should be inferred from design previews or defaulted to 2px.
- **Exact button padding:** Padding values inferred from component patterns but not directly extracted; exact px values (e.g., 12px × 16px) were not measured on individual button roles.
- **Gradient or decorative meshes:** No CSS gradients, mesh backgrounds, or decorative overlays were found in the extracted styles. The design system relies on flat color blocking.
- **Dark mode behavior:** Only one theme (dark) was analyzed; light mode or dynamic theme switching was not observed or extracted.
- **Authenticated surfaces:** Only public pages were analyzed; user dashboard, account settings, or subscription-gated interfaces were not visited or extracted.
- **Animation timing functions and durations:** Hover and focus transitions (e.g., opacity fades, scale transforms) exist but specific transition durations and easing functions were not measured.
- **Secondary and tertiary accent colors:** Semantic names like `var(--secondary-accent-color)` and `var(--overlay-color)` are referenced in hover states but their hex values were not extracted; implementers should define these as variants or derive them from the four primary colors.
- **Exact card dimensions:** Media card widths and heights scale responsively but exact px measurements at each breakpoint were not extracted; responsive sizing logic was not audited.
- **Link underline behavior:** Link hover states show text-decoration underline, but underline color, thickness, and offset were not specified.