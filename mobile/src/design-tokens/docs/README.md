# Shared Design Tokens

This directory contains the design tokens that are shared between the desktop Vue app and the mobile Ionic app. These tokens define the visual language of the application including colors, spacing, typography, borders, and shadows.

## Structure

- `colors.ts` - Color palette and semantic colors
- `spacing.ts` - Spacing scale and safe area insets
- `typography.ts` - Font families, sizes, weights, and line heights
- `borders.ts` - Border radius, width, and styles
- `shadows.ts` - Shadow definitions
- `index.ts` - Barrel export of all tokens
- `tailwind.plugin.js` - Tailwind CSS plugin for integrating tokens

## Usage

### In Vue Components

```typescript
import { colors, spacing } from '@/design-tokens';

// Use the tokens directly in your components
const backgroundColor = colors.bg.DEFAULT;
const paddingValue = `${spacing.md}px`;
```

### In CSS

The tokens are also available as CSS custom properties:

```css
.my-component {
  background-color: var(--bg);
  padding: var(--spacing-md);
}
```

## Mobile Considerations

### Safe Areas

The `spacing.safe` object contains values for safe area insets which should be used for mobile layouts:

```css
.mobile-layout {
  padding-top: var(--safe-top);
  padding-bottom: var(--safe-bottom);
}
```

### Touch Targets

The `spacing.touch.target` value (44px) represents the minimum touch target size for mobile interfaces. Ensure interactive elements meet this size requirement.

## Adding New Tokens

1. Add the token to the appropriate file (colors, spacing, etc.)
2. If it should be available as a CSS custom property, add it to the tailwind.plugin.js file
3. Update this documentation if necessary

## Theme Support

The design tokens support both dark and light themes. The light theme variants are nested under the `light` key in the colors object. Theme switching is handled through CSS custom properties and the `data-theme` attribute on the root element.