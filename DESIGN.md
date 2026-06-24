# Design

## Theme

Dark-first. Physical scene: a developer at a desk late at night, local LLMs running on the machine, focused on output. Light mode exists but is secondary.

## Color Strategy

Restrained — tinted neutrals + one saturated accent (≤10% of surface). Data and information carry the visual weight, not decorative color.

## Palette

### Dark (primary)
```css
--bg:       oklch(0.08 0 0)
--surface:   oklch(0.14 0.003 294.3)
--ink:       oklch(0.95 0.005 294.3)
--muted:     oklch(0.55 0.01 294.3)
--primary:   oklch(0.533 0.125 294.3)
--accent:    oklch(0.55 0.15 240)
--border:    oklch(0.22 0.005 294.3)
```

### Light (secondary)
```css
--bg:       oklch(1.0 0 0)
--surface:   oklch(0.955 0.003 294.3)
--ink:       oklch(0.12 0.005 294.3)
--muted:     oklch(0.48 0.01 294.3)
--primary:   oklch(0.533 0.125 294.3)
--accent:    oklch(0.48 0.15 245)
--border:    oklch(0.86 0.005 294.3)
```

## Typography

```css
--font-ui:    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif
--font-mono:  'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace
```

- UI text at 14px base, scale: 12 / 14 / 16 / 20 / 24 / 32
- Metric values always monospace for alignment
- No custom font loading (performance); system fonts only

## Spacing

4px base unit. Scale: 2 / 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64

## Borders & Radii

- Border: 1px solid `var(--border)`
- Radius: 6px (controls, cards), 8px (dialogs), 4px (inline elements)
- No heavy shadows. Elevated surfaces get `0 1px 3px rgba(0,0,0,0.3)` dark, `0 1px 2px rgba(0,0,0,0.06)` light

## Motion

- Duration: 150ms (micro-interactions), 250ms (transitions)
- Easing: cubic-bezier(0.16, 1, 0.3, 1) — ease-out-expo
- `prefers-reduced-motion`: all transitions become 0ms
- Chart animations: 300ms, ease-out-cubic
- No bounce, no elastic, no parallax, no staggered reveals
