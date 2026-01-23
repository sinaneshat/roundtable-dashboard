import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_protected/chat/projects')({
  staleTime: Infinity,
  component: ProjectsLayout,
});

function ProjectsLayout() {
  return <Outlet />;
}
