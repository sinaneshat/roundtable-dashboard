import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_protected/chat/projects/$projectId')({
  staleTime: Infinity,
  component: ProjectIdLayout,
});

function ProjectIdLayout() {
  return <Outlet />;
}
