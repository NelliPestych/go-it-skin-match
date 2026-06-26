import { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./IconButton.module.css";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  light?: boolean;
  children: ReactNode;
}

export default function IconButton({ light, children, className, ...rest }: Props) {
  const cls = [
    styles["icon-btn"],
    light && styles["icon-btn-light"],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
