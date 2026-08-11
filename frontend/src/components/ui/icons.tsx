import type { SVGProps } from 'react';

/**
 * Inline single-colour icons used by the auth screens.
 *
 * SVG rather than emoji so they inherit `currentColor`, stay crisp at any size
 * and render identically across platforms.
 */

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export const IconUsers = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconBox = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
  </svg>
);

export const IconTruck = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14 18V6a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2" />
    <path d="M14 9h4l3 3v5a1 1 0 0 1-1 1h-1" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
    <path d="M9 18h6" />
  </svg>
);

export const IconShield = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const IconCrown = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m3 7 4.5 3.5L12 4l4.5 6.5L21 7l-1.8 11H4.8z" />
  </svg>
);

export const IconReport = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h5" />
  </svg>
);

export const IconLock = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 1 1 8 0v3" />
  </svg>
);

export const IconMail = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 6 10-6" />
  </svg>
);

export const IconEye = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.2 6.2A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
  </svg>
);

export const IconBolt = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </svg>
);

export const IconChart = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-5 3 3 5-7" />
  </svg>
);

export const IconCheck = (props: IconProps) => (
  <svg {...base({ strokeWidth: 3, ...props })}>
    <path d="m5 13 4 4L19 7" />
  </svg>
);

export const IconSpark = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
  </svg>
);
