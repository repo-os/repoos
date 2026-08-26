# Design Token Naming Conventions

## General Principles

1. **Descriptive Names**: Token names should clearly describe their purpose or usage
2. **Consistent Hierarchy**: Use a consistent naming hierarchy (category/subcategory/name)
3. **Avoid Color/Size References**: Prefer functional names over literal color/size descriptions
4. **Platform Agnostic**: Use names that work for both web and mobile platforms

## Categories

### Colors

- **Core Colors**: Base color palette (cyan, violet, green, red, amber)
- **Background Colors**: Page, panel, and component backgrounds
- **Text Colors**: Primary, secondary, and decorative text
- **Border Colors**: Default and variant borders
- **Semantic Colors**: Success, error, warning, info
- **Themed Colors**: Variants for different themes (light/dark)

Naming pattern: `category-subcategory-name`

Examples:
- `colors.bg.DEFAULT` (default background)
- `colors.text.primary` (primary text color)
- `colors.border.bright` (brighter border variant)
- `colors.success` (semantic success color)

### Spacing

- **Scale Values**: xs, sm, md, lg, xl, etc.
- **Specialized Spacing**: Safe areas, touch targets

Naming pattern: `size` or `category-name`

Examples:
- `spacing.md` (medium spacing)
- `spacing.safe.top` (top safe area inset)
- `spacing.touch.target` (minimum touch target size)

### Typography

- **Font Families**: Sans and mono families
- **Font Sizes**: xs through 3xl scales
- **Font Weights**: Normal through extrabold
- **Line Heights**: Tight through loose
- **Letter Spacing**: Tighter through widest

Naming pattern: `property-name`

Examples:
- `typography.fontFamily.sans` (primary font family)
- `typography.fontSize.xl` (extra large font size)
- `typography.fontWeight.bold` (bold font weight)

### Borders

- **Radius Values**: none through full
- **Width Values**: none, thin, thick
- **Style Values**: solid, dashed

Naming pattern: `property-size`

Examples:
- `borders.radius.lg` (large border radius)
- `borders.width.thin` (thin border width)
- `borders.style.dashed` (dashed border style)

### Shadows

- **Standard Shadows**: xs through 3xl intensity
- **Specialized Shadows**: Card glow, logo shadow, etc.

Naming pattern: `intensity` or `usage`

Examples:
- `shadows.md` (medium shadow)
- `shadows.cardGlow` (specialized card glow effect)

## Functional vs. Literal Naming

Prefer functional names that describe the purpose rather than literal descriptions:

**Good:**
- `colors.success`
- `colors.background.panel`
- `spacing.touch.target`

**Avoid:**
- `colors.green`
- `colors.lightGray`
- `spacing.fortyFourPixels`

## Theme-Specific Tokens

Theme-specific variations should be nested under their theme key:

```typescript
// Good
colors.light.bg.DEFAULT
colors.dark.bg.DEFAULT

// Avoid
colors.bgLight
colors.bgDark
```

## CSS Custom Properties

CSS custom properties should mirror the JavaScript object structure:

```css
/* Good */
--bg: #070a12;
--light-bg: #f4f6fb;

/* Avoid */
--dark-blue-bg: #070a12;
--light-gray-bg: #f4f6fb;
```

## Mobile-Specific Considerations

For mobile-specific tokens, use clear prefixes or categories:

- `spacing.safe.top` (safe area insets)
- `spacing.touch.target` (minimum touch target size)

These tokens should be used specifically for mobile layouts and interactions to ensure proper usability on touch devices.