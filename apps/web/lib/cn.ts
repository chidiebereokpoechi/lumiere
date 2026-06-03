import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Conditional className join with Tailwind conflict resolution. `clsx` handles
// arrays/objects/falsy values; `twMerge` ensures a later utility wins over an
// earlier one in the same group (so component defaults can be overridden by a
// caller's `className` prop). Use everywhere instead of hand-built template
// literals.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
