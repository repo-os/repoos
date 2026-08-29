export const spacing = {
  // Base spacing unit (8px grid)
  unit: 8,

  // Standardized spacing scale
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 40,
  "3xl": 48,
  "4xl": 56,
  "5xl": 64,

  // Safe area insets (for mobile)
  safe: {
    top: "env(safe-area-inset-top, 0px)",
    right: "env(safe-area-inset-right, 0px)",
    bottom: "env(safe-area-inset-bottom, 0px)",
    left: "env(safe-area-inset-left, 0px)",
  },

  // Touch targets (minimum 44px for accessibility)
  touch: {
    target: 44,
    minimum: 44,
  },
};
