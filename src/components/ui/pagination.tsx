'use client';
import { Button } from '@/components/ui/button';

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        Next
      </Button>
    </div>
  );
}