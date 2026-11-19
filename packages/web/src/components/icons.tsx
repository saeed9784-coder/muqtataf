import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = (path: ReactNode) =>
  function Icon(props: IconProps) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        {path}
      </svg>
    );
  };

export const FlameIcon = base(<path d="M12 2c1 3 4 5 4 9a4 4 0 1 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z" />);
export const ClockIcon = base(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const FeedIcon = base(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>);
export const BookmarkIcon = base(<path d="M6 3h12v18l-6-4-6 4z" />);
export const LayersIcon = base(<><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>);
export const HashIcon = base(<path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" />);
export const SearchIcon = base(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const UpvoteIcon = base(<path d="M12 4 4 13h5v7h6v-7h5z" />);
export const CommentIcon = base(<path d="M4 5h16v11H8l-4 4z" />);
export const ExternalIcon = base(<><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v6H4V6h6" /></>);
