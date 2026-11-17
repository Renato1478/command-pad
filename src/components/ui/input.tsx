import type { ComponentProps } from "react";

export function Input({
  className = "",
  type = "text",
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type}
      className={`ui-input ${className}`}
      {...props}
    />
  );
}
