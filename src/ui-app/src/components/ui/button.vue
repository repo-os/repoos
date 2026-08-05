<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { Primitive, type PrimitiveProps } from "radix-vue";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[11px] text-[13px] font-semibold transition-[filter,background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-bright)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--border-bright)] bg-[image:var(--btn-primary-bg)] text-[var(--btn-primary-color)] hover:brightness-110",
        accent:
          "border border-[var(--border-bright)] bg-[image:var(--btn-new-bg)] text-[var(--btn-new-color)] hover:brightness-110",
        outline:
          "border border-[var(--border)] bg-[var(--panel)] text-[var(--txt)] hover:border-[var(--border-bright)]",
        ghost: "text-[var(--txt-dim)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--txt)]",
        destructive:
          "border border-[var(--red-border-tint)] bg-[var(--red-tint)] text-[var(--red)] hover:brightness-110",
      },
      size: {
        default: "px-4 py-[11px]",
        sm: "rounded-[9px] px-3 py-2 text-xs",
        lg: "rounded-[11px] px-5 py-[11px]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

interface Props extends PrimitiveProps {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<Props>(), {
  as: "button",
  variant: "default",
  size: "default",
});
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
