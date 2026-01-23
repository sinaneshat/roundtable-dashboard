import { memo } from 'react';

import type { ProjectListItemData } from '@/components/projects/project-list-item';
import { ProjectListItem } from '@/components/projects/project-list-item';
import { SidebarMenu } from '@/components/ui/sidebar';

type ProjectListProps = {
  projects: ProjectListItemData[];
  expandedProjects: Record<string, boolean>;
  onToggleExpand: (projectId: string) => void;
  onEditProject?: (project: ProjectListItemData) => void;
  onDeleteProject?: (project: ProjectListItemData) => void;
  maxThreadsPerProject?: number;
  onNewThreadInProject?: (projectId: string) => void;
};

function ProjectListComponent({
  projects,
  expandedProjects,
  onToggleExpand,
  onEditProject,
  onDeleteProject,
  maxThreadsPerProject,
  onNewThreadInProject,
}: ProjectListProps) {
  if (projects.length === 0) {
    return null;
  }

  return (
    <SidebarMenu className="gap-0.5 px-2">
      {projects.map(project => (
        <ProjectListItem
          key={project.id}
          project={project}
          isExpanded={!!expandedProjects[project.id]}
          onToggleExpand={onToggleExpand}
          onEdit={onEditProject}
          onDelete={onDeleteProject}
          maxThreads={maxThreadsPerProject}
          onNewThread={onNewThreadInProject}
        />
      ))}
    </SidebarMenu>
  );
}

export const ProjectList = memo(ProjectListComponent);
