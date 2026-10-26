/**
 * A leaderboard rank (0-based in, shown 1-based). A record sharing the rank
 * of one above it is muted and says "(tie)", as on the Tower voting
 * leaderboard (the label drops below md, where the column is narrow).
 */
const RankCell = ({ rank, tie }: { rank: number; tie: boolean }) => (
  <span className={tie ? 'text-body-quaternary' : undefined}>
    {rank + 1}
    {tie && (
      <span className="text-body-quaternary fs-10 ms-1 d-none d-md-inline">
        (tie)
      </span>
    )}
  </span>
);

export default RankCell;
