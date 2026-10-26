import { hasMissingBlockData } from 'helpers/utils';
import { useMemo } from 'react';

export interface EpochSelectOption {
  label: string;
  /** Epoch number, or `undefined` to mean "current epoch" (for no-arg fetch)
   *  and for the separator entry. */
  value: number | undefined;
  disabled?: boolean;
}

interface Args {
  /** Current epoch from the server; `null` while still loading. */
  currentEpoch: number | null | undefined;
  /** Epoch currently shown in the page (may be historical or === current). */
  resolvedEpoch: number | undefined;
  /** Label suffix for the newest epoch (default ' (Current)'); e.g.
   *  ' (last Tower)' when the list is capped at the Tower cutover. */
  latestSuffix?: string;
}

/**
 * Builds the dropdown contents shared by the epoch selectors on the voting
 * leaderboard, income leaderboard, and vote-history pages.
 *
 * Rules:
 *   - Known current epoch, viewing near-current: contiguous [current-9 .. current].
 *   - Known current, viewing far past: ±4 around the viewed epoch (capped
 *     below current) + separator + the current epoch.
 *   - Unknown current, viewing a specific epoch: show the viewed epoch + 4
 *     older neighbors + separator + generic "Current Epoch" (triggers a
 *     no-arg fetch).
 *   - Unknown current and no resolved epoch: just offer "Current Epoch".
 *
 * The list is sorted newest-first.
 */
const useEpochSelectOptions = ({
  currentEpoch,
  resolvedEpoch,
  latestSuffix = ' (Current)'
}: Args): EpochSelectOption[] =>
  useMemo(() => {
    const epochLabel = (i: number, suffix = '') =>
      `Epoch ${i}${suffix}${hasMissingBlockData(i) ? ' (missing data)' : ''}`;

    if (currentEpoch !== null && currentEpoch !== undefined) {
      const options: EpochSelectOption[] = [];
      const minSuggestedEpoch = Math.max(0, currentEpoch - 9);
      if (
        resolvedEpoch !== undefined &&
        resolvedEpoch < minSuggestedEpoch + 4
      ) {
        const minOldEpoch = Math.max(0, resolvedEpoch - 4);
        const maxOldEpoch = Math.min(resolvedEpoch + 4, currentEpoch - 1);
        for (let i = minOldEpoch; i <= maxOldEpoch; i++) {
          options.push({ label: epochLabel(i), value: i });
        }
        options.push({ label: '---', value: undefined, disabled: true });
        options.push({
          label: epochLabel(currentEpoch, latestSuffix),
          value: currentEpoch
        });
      } else {
        for (let i = minSuggestedEpoch; i <= currentEpoch; i++) {
          options.push({
            label: epochLabel(i, i === currentEpoch ? latestSuffix : ''),
            value: i
          });
        }
      }
      options.reverse();
      return options;
    }

    if (resolvedEpoch !== undefined) {
      const options: EpochSelectOption[] = [];
      const minOldEpoch = Math.max(0, resolvedEpoch - 4);
      for (let i = resolvedEpoch; i >= minOldEpoch; i--) {
        options.push({ label: epochLabel(i), value: i });
      }
      options.push({ label: '---', value: undefined, disabled: true });
      options.push({ label: 'Current Epoch', value: undefined });
      return options;
    }

    return [{ label: 'Current Epoch', value: undefined }];
  }, [currentEpoch, resolvedEpoch, latestSuffix]);

export default useEpochSelectOptions;
