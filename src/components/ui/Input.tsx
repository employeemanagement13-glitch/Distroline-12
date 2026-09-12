import * as React from "react"

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={[
        "flex h-[30px] w-full rounded-[var(--radius-sm)]",
        "border border-[var(--border)] bg-white",
        "px-2.5 py-1 text-[11.5px] text-[var(--text-primary)]",
        "placeholder:text-[var(--text-muted)]",
        "shadow-[var(--shadow-sm)]",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)] focus-visible:border-[var(--primary)]",
        "file:border-0 file:bg-transparent file:text-xs file:font-medium",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className ?? "",
      ].join(" ")}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }

