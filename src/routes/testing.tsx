import { createFileRoute, Outlet } from "@tanstack/react-router";

// Pure layout route - /testing renders testing.index.tsx, /testing/$runId
// renders testing.$runId.tsx. Both live under this file only because
// TanStack Router's flat file routing nests any "testing.*" file under
// "testing.tsx" once it exists; the actual page content lives in the
// child routes, not here.
export const Route = createFileRoute("/testing")({
  component: () => <Outlet />,
});
