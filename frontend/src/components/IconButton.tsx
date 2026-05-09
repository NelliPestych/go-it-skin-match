import { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  light?: boolean;
  children: ReactNode;
}

export default function IconButton({ light, children, className, ...rest }: Props) {
  const cls =
    "icon-btn" +
    (light ? " icon-btn-light" : "") +
    (className ? ` ${className}` : "");
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
