# Design Token Consumption Guide

This guide explains how to consume the shared design tokens in both the desktop Vue app and mobile Ionic app.

## Desktop Vue App Consumption

### Installation

The design tokens are already integrated into the Vue app through the existing styling system. The tokens are available as both JavaScript objects and CSS custom properties.

### Using JavaScript Tokens

Import the tokens directly in your Vue components:

```typescript
import { colors, spacing, typography } from '@/design-tokens';

export default {
  data() {
    return {
      backgroundColor: colors.bg.DEFAULT,
      paddingValue: `${spacing.md}px`,
      fontFamily: typography.fontFamily.sans
    }
  }
}
```

### Using CSS Custom Properties

All tokens are available as CSS custom properties:

```vue
<style scoped>
.my-component {
  background-color: var(--bg);
  color: var(--txt);
  padding: var(--spacing-md);
  border-radius: var(--radius-lg);
  font-family: var(--font-sans);
  box-shadow: var(--card-glow);
}
</style>
```

### Theme Switching

Themes are controlled through the `data-theme` attribute on the root element:

```javascript
// Switch to light theme
document.documentElement.setAttribute('data-theme', 'light');

// Switch to dark theme (default)
document.documentElement.setAttribute('data-theme', 'dark');
```

## Mobile App Consumption

### Installation

For the mobile app, the design tokens are available as CSS custom properties in `css-variables.css`:

```css
@import '../design-tokens/css-variables.css';
```

### Using CSS Custom Properties

Use the CSS custom properties directly in your Ionic components:

```css
.my-mobile-component {
  background-color: var(--bg);
  color: var(--txt);
  padding: var(--spacing-md);
  border-radius: var(--radius-lg);
  font-family: var(--font-sans);
}
```

### Safe Area Insets

Use the safe area insets for proper mobile layout:

```css
.mobile-layout {
  padding-top: var(--safe-top);
  padding-bottom: var(--safe-bottom);
  padding-left: var(--safe-left);
  padding-right: var(--safe-right);
}
```

### Touch Targets

Ensure interactive elements meet the minimum touch target size:

```css
.touch-button {
  min-width: var(--touch-target);
  min-height: var(--touch-target);
}
```

## Integration with Tailwind CSS

The desktop app uses Tailwind CSS with a custom plugin that maps design tokens to Tailwind utilities.

### Using Tailwind Utilities

Many tokens are available as Tailwind classes:

```html
<div class="bg-[--bg] text-[--txt] p-[--spacing-md] rounded-[--radius-lg] font-sans">
  Content with design tokens
</div>
```

### Extending Tailwind Configuration

The Tailwind plugin automatically extends the configuration with design tokens. You can also reference them directly in your templates:

```html
<button class="bg-[--btn-primary-bg] text-[--btn-primary-color] px-4 py-2 rounded-[--radius-md]">
  Primary Button
</button>
```

## Best Practices

### Consistency

Always use the design tokens rather than hardcoding values to ensure consistency across platforms:

```css
/* Good */
.component {
  background-color: var(--bg);
  border-radius: var(--radius-lg);
}

/* Avoid */
.component {
  background-color: #070a12;
  border-radius: 11px;
}
```

### Theme Awareness

Consider how components will look in both light and dark themes:

```css
.component {
  /* This will automatically switch between themes */
  background-color: var(--bg);
  color: var(--txt);
}
```

### Mobile-First Approach

When designing components, consider mobile constraints:

```css
.component {
  /* Meet minimum touch target size */
  min-width: var(--touch-target);
  min-height: var(--touch-target);
  
  /* Respect safe areas on mobile */
  margin-top: var(--safe-top);
}
```

## Testing Token Consumption

### Visual Verification

Create a simple test component that displays various tokens:

```vue
<template>
  <div class="token-test">
    <div class="bg-[--bg] text-[--txt] p-[--spacing-md]">Background Test</div>
    <div class="bg-[--panel] text-[--txt-dim] p-[--spacing-md]">Panel Test</div>
    <div class="text-[--cyan] p-[--spacing-md]">Cyan Text Test</div>
  </div>
</template>
```

### Automated Testing

Create unit tests to verify token values:

```typescript
import { colors, spacing } from '@/design-tokens';

describe('Design Tokens', () => {
  test('should have correct background color', () => {
    expect(colors.bg.DEFAULT).toBe('#070a12');
  });

  test('should have correct spacing scale', () => {
    expect(spacing.md).toBe(16);
  });
});
```

## Troubleshooting

### Token Not Applying

If a token doesn't seem to be applying:

1. Check that the CSS custom property is defined in the plugin
2. Verify the element is within the scope where tokens are applied
3. Ensure the theme is correctly set

### Theme Switching Issues

If themes aren't switching correctly:

1. Verify the `data-theme` attribute is being set on the root element
2. Check that both dark and light theme values are defined
3. Ensure there are no conflicting CSS rules overriding the tokens

### Mobile Layout Issues

For mobile layout problems:

1. Ensure safe area insets are being used appropriately
2. Check that touch targets meet minimum size requirements
3. Verify that viewport meta tags are properly configured for mobile