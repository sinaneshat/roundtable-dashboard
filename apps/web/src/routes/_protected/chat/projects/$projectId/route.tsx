import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_protected/chat/projects/$projectId')({
  component: ProjectIdLayout,
  staleTime: Infinity,
});

function ProjectIdLayout() {
  return <Outlet />;
}
