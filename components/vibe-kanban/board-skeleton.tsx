import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";

/** Card counts chosen so the placeholder reads as a board, not a grid. */
const COLUMN_SHAPE = [2, 3, 1, 2];

function CardSkeleton({ delay }: { delay: number }) {
  return (
    <div className="vibe-kanban-card vibe-kanban-card-skeleton">
      <div className="vibe-kanban-card-head">
        <Skeleton className="size-[22px] rounded-[7px]" delay={delay} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
          <SkeletonLine width="92%" delay={delay} />
          <SkeletonLine width="58%" delay={delay + 40} />
        </div>
      </div>
      <div className="vibe-kanban-card-meta">
        <SkeletonLine width="74%" className="h-2.5" delay={delay + 80} />
        <SkeletonLine width="56%" className="h-2.5" delay={delay + 120} />
      </div>
      <div className="vibe-kanban-card-footer">
        <SkeletonLine width="44%" className="h-2.5" delay={delay + 160} />
        <SkeletonLine width="22px" className="h-2.5" delay={delay + 160} />
      </div>
    </div>
  );
}

/**
 * Mirrors the real board's geometry exactly, so the transition to loaded data
 * is a change of content rather than a change of layout.
 */
function BoardSkeleton() {
  return (
    <div className="vibe-kanban-board" role="status" aria-label="Loading Vibe Kanban">
      {COLUMN_SHAPE.map((cards, column) => (
        <section className="vibe-kanban-column" key={column}>
          <header className="vibe-kanban-column-header">
            <Skeleton shape="circle" className="size-2" delay={column * 60} />
            <SkeletonLine width="72px" className="h-3" delay={column * 60} />
            <SkeletonLine width="16px" className="ml-auto h-3" delay={column * 60 + 40} />
          </header>
          <div className="vibe-kanban-column-scroll">
            {Array.from({ length: cards }, (_, index) => (
              <CardSkeleton key={index} delay={column * 60 + index * 90} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Reserve the compact toolbar’s layout while the board loads. */
function ToolbarSkeleton() {
  return (
    <div className="vibe-kanban-toolbar" aria-hidden="true">
      <div className="vibe-kanban-toolbar-main">
        <Skeleton className="vibe-kanban-project-picker h-8" />
        <Skeleton className="vibe-kanban-view-picker h-8" delay={40} />
        <Skeleton className="vibe-kanban-search h-8" delay={80} />
        <Skeleton className="vibe-kanban-filter-button h-8 w-20" delay={120} />
        <Skeleton className="vibe-kanban-new-task h-8 w-24" delay={160} />
      </div>
    </div>
  );
}

export { BoardSkeleton, ToolbarSkeleton };
