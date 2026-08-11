import { ICONS } from '../../config/icons.js';

export default function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 1.7, style, className }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
