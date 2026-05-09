import { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  trailingIcon?: ReactNode;
  leadingIcon?: ReactNode;
}

export default function PillButton({
  variant = "primary",
  trailingIcon,
  leadingIcon,
  children,
  className,
  ...rest
}: Props) {
  const cls =
    "pill-btn" +
    (variant === "secondary" ? " pill-btn-secondary" : "") +
    (className ? ` ${className}` : "");
  return (
    <button className={cls} {...rest}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
