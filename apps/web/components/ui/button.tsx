"use client";

import type React from "react";
import { buttonClasses, type ButtonVariant } from "./button-variants";

// Spenny-language button. `variant` sets the palette; `className` is merged last
// (via cn → tailwind-merge) so callers can override width/spacing/tracking.
// For button-styled links, import `buttonClasses` from ./button-variants
// directly (it's server-safe; this module is "use client").
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({
  variant = "primary",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...rest} />;
}
