import { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./PillButton.module.css";

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
  const cls = [
    styles["pill-btn"],
    variant === "secondary" && styles["pill-btn-secondary"],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
