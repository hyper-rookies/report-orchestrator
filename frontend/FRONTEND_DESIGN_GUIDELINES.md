# Frontend Design Guidelines (NHN AD)

## Purpose
- Keep the current product functionality intact while improving UI quality.
- Apply NHN AD brand color system consistently across new screens/components.
- Maintain accessibility and interaction clarity (WCAG AA baseline).

## 1. Color System

### Core Brand Colors
- `--primary`: `#1F5298` (Spectrum Blue, light mode)
- `--ring`: `#1F5298` (focus ring, light mode)
- `--foreground`: `#191919` (NHN Black)
- `--background`: `#FFFFFF` (NHN White)
- `--chart-2`: `#1C91CA` (Spectrum Cyan)
- `--chart-5`: `#1D8844` (success-safe green)
- `--destructive`: `#D41F4C` (error)
- `--border`: neutral gray family (`#D8DDE2`)

### Dark Mode Mapping
- Background around `#0B0B0B`
- Surface/Card around `#191919`
- Primary CTA around `#1C7EAE`
- Focus/interactive highlights around `#1C91CA`

### Usage Ratio
- Neutral base colors: `80~90%`
- Accent colors: `10~20%`
- Avoid full-page saturated gradients; use subtle accent overlays only.

## 2. Accessibility Rules (Required)
- Body text contrast: at least `4.5:1` (AA)
- Large text contrast: at least `3:1`
- Non-text UI boundaries/focus: at least `3:1`
- Do not convey state by color only:
  - combine color with text, icon, or shape change
- Focus style must remain visible on keyboard navigation.

## 3. Component Rules
- Reuse existing UI primitives in `frontend/src/components/ui/*`.
- Keep border radius mostly in the `rounded-lg ~ rounded-2xl` range.
- Card/surface components should use:
  - soft border
  - subtle shadow
  - high text contrast
- Primary buttons must keep strong contrast with white text.
- Inputs must preserve visible border + focus ring.

## 4. Charts & Data Display
- Default palette:
  - `--chart-1`: primary blue
  - `--chart-2`: cyan
  - `--chart-3`: destructive red
  - `--chart-4`: orange
  - `--chart-5`: green
- Table headers should be visually distinct (weight/uppercase/muted tone).
- Tooltips should remain readable in both light/dark modes.

## 5. Functional Safety Rules (Do Not Break)
- Do not change SSE frame contract:
  - `progress`, `chunk`, `table`, `chart`, `final`, `error`
- Do not remove current auth flow behavior:
  - mock mode and Cognito mode must both work
- Styling changes should not alter:
  - API calls
  - event parsing
  - routing/middleware logic

## 6. PR Checklist for New Frontend Features
- [ ] Existing flows still work (`/`, `/dashboard`, `/login`, `/signup`, `/shared/[token]`)
- [ ] Keyboard focus visible on all new interactive controls
- [ ] Text/icon contrast meets AA targets
- [ ] Error/success states are not color-only
- [ ] Chat SSE rendering still shows: summary + table/chart/error
- [ ] `npm run build` passes in normal network-enabled environment

## 7. Future Screen Guardrails
- Start from `nhn-panel` + semantic color tokens; do not hardcode random new colors.
- Keep interaction hierarchy:
  - Primary action: `--primary`
  - Secondary action: outline/neutral
  - Dangerous action: `--destructive`
- New charts should default to tokenized palette (`--chart-*`) and readable tooltips.
- For data-heavy pages, prioritize:
  - fixed page title area
  - scrollable content body
  - fixed primary action area when needed
- Never mix style changes with API/event contract changes in one PR.
