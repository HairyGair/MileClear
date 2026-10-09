import { Icon, type IconName } from "../kit/Icon";
import { cx } from "../kit/cx";
import { digitGroups, fitsDigitCells, formatOdo } from "./odometerLogic";
import styles from "./driving.module.css";

/**
 * The running odometer. Large = digit cells, compact = one tabular number.
 * One element for assistive tech: "Odometer about 45,262 miles, estimated".
 *
 *   <OdometerFigure miles={45262} estimated />
 *   <OdometerFigure miles={45140} size="compact" />
 */
export function OdometerFigure({
  miles,
  estimated,
  size = "large",
}: {
  miles: number;
  estimated: boolean;
  size?: "large" | "compact";
}) {
  const label = `Odometer ${estimated ? "about " : ""}${formatOdo(miles)} miles, ${estimated ? "estimated" : "recorded"}`;
  if (size === "compact" || !fitsDigitCells(miles)) {
    return (
      <span className={cx(styles.compact)} role="img" aria-label={label}>
        <span aria-hidden="true">{formatOdo(miles)} mi</span>
      </span>
    );
  }
  return (
    <span className={styles.figure} role="img" aria-label={label} data-testid="odometer-figure">
      <span className={styles.groups} aria-hidden="true">
        {digitGroups(miles).map((group, gi) => (
          <span key={gi} className={styles.group}>
            {group.map((d, di) => (
              <span key={di} className={styles.cell}>
                {d}
              </span>
            ))}
          </span>
        ))}
      </span>
      <span className={styles.unit} aria-hidden="true">mi</span>
    </span>
  );
}

/** "Recorded" (solid border) or "Estimated" (dashed). Never amber, never green. */
export function OdometerChip({ estimated, icon }: { estimated: boolean; icon?: IconName }) {
  return (
    <span className={cx(styles.chip, estimated ? styles.chipEstimated : styles.chipRecorded)}>
      <Icon name={estimated ? "calculator-outline" : icon ?? "create-outline"} size={12} />
      {estimated ? "Estimated" : "Recorded"}
    </span>
  );
}
