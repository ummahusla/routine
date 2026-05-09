export function Logo({ size = 18, strokeWidth = 2, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5 6h6l3 3h6" />
      <path d="M5 12h14" />
      <path d="M5 18h6l3-3h6" />
    </svg>
  );
}
