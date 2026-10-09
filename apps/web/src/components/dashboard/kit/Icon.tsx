import { ICON_PATHS, type IconName } from "./icons/paths";
import { cx } from "./cx";

export type { IconName };

/**
 * One inline SVG set (Ionicons, same names as the app). Colour is always
 * currentColor. Sizes: 16 inline, 20 rail/buttons, 24 tab bar and empty states.
 *
 *   <Icon name="car-outline" size={20} />
 */
export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={cx("mc-icon", className)}
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
