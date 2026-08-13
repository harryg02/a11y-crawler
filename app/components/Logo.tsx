/**
 * A11y Crawler mark.
 *
 * An open scan path with a node riding its leading edge: the ring is a crawl
 * that hasn't closed yet, the dot is the page it's on, the inner ring is the
 * scan itself. Drawn on the same rules as the lucide icons it sits beside —
 * 32-unit box, round caps, no fill except the node — so it reads as part of the
 * set rather than an import.
 *
 * Stroked in currentColor, so it inherits the surrounding text colour and flips
 * with the theme for free. Decorative by default: every place it appears sits
 * next to the words "A11y Crawler", so naming it again would just make screen
 * readers say it twice. Pass a `title` where it ever stands alone.
 */
export default function Logo({
  className = 'w-8 h-8',
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path d="M 20.31 4.16 A 12.6 12.6 0 1 0 26.45 8.95" />
      <circle cx="16" cy="16" r="5.6" />
      <circle cx="20.31" cy="4.16" r="3.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
