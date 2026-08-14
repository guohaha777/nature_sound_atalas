import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  href?: string;
  tone?: "primary" | "secondary" | "quiet";
}

export function Action({ children, href, tone = "primary", className = "", ...props }: ActionProps) {
  const classes = `action action--${tone} ${className}`.trim();
  if (href) return <a className={classes} href={href}>{children}</a>;
  return <button className={classes} {...props}>{children}</button>;
}
