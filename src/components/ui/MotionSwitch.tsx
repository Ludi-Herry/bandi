"use client";

import type { ComponentPropsWithoutRef } from "react";
import * as Switch from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export interface MotionSwitchProps
  extends Omit<
    ComponentPropsWithoutRef<typeof Switch.Root>,
    "children" | "onCheckedChange"
  > {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: "sm" | "default";
  thumbClassName?: string;
}

export function MotionSwitch({
  checked,
  onCheckedChange,
  className,
  size = "default",
  thumbClassName,
  ...props
}: MotionSwitchProps) {
  return (
    <Switch.Root
      {...props}
      checked={checked}
      data-slot="switch"
      data-size={size}
      onCheckedChange={onCheckedChange}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-[color:var(--border-default)] bg-[color:var(--bg-surface-hover)] shadow-sm outline-none",
        "after:absolute after:-inset-x-3 after:-inset-y-2 after:content-['']",
        "transition-[background-color,border-color,box-shadow] duration-150 ease-out",
        "focus-visible:border-[color:var(--accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent-muted)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-[color:var(--accent)] data-[state=checked]:bg-[color:var(--accent)]",
        size === "default" ? "h-[22px] w-10" : "h-[18px] w-8",
        className,
      )}
    >
      <Switch.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block shrink-0 translate-x-0 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.34)] ring-0",
          "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          size === "default"
            ? "size-[18px] data-[state=checked]:translate-x-5"
            : "size-3.5 data-[state=checked]:translate-x-4",
          thumbClassName,
        )}
      />
    </Switch.Root>
  );
}
