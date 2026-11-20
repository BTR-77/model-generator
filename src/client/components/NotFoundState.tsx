import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";

export function NotFoundState({ what }: { what: string }) {
  return (
    <div data-testid="not-found">
      <EmptyState
        kind="filtered"
        title={`${what} not found`}
        description="It was deleted, or it isn't shared with you."
        action={
          <Button variant="outline" render={<Link to="/" />} nativeButton={false}>
            Back to the library
          </Button>
        }
      />
    </div>
  );
}
