interface ChartSkeletonProps {
  height?: number;
}

// Static height profile so the skeleton bars don't jitter on re-render.
// Picked to feel like a real bar-chart silhouette (some peaks, some
// troughs) without actually mirroring any data.
const HEIGHTS = [
  35, 50, 30, 65, 45, 55, 40, 70, 50, 35, 60, 45, 55, 40, 65, 35, 50, 60, 45,
  55, 30, 65, 50, 40, 55, 60, 35, 45, 50, 30
];

const ChartSkeleton = ({ height = 270 }: ChartSkeletonProps) => {
  return (
    <div
      className="placeholder-glow d-flex align-items-end gap-1 w-100"
      style={{ height }}
    >
      {HEIGHTS.map((h, i) => (
        <span
          key={i}
          className="placeholder rounded bg-primary-subtle flex-grow-1"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
};

export default ChartSkeleton;
