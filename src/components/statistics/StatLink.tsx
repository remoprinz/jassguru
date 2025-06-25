import React from 'react';
import Link from 'next/link';
import { useClickAndScrollHandler } from '@/hooks/useClickAndScrollHandler';

interface StatLinkProps {
  href: string;
  children: React.ReactNode;
  isClickable: boolean;
  className?: string;
}

export const StatLink: React.FC<StatLinkProps> = ({ href, children, isClickable, className }) => {
  const clickHandlers = useClickAndScrollHandler();

  if (!isClickable) {
    // Wenn nicht klickbar, rendere ein div anstelle eines Links
    return <div className={className}>{children}</div>;
  }

  return (
    <Link
      href={href}
      className={className}
      {...clickHandlers}
    >
      {children}
    </Link>
  );
}; 