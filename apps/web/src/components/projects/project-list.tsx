import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON } from '@roundtable/shared';
import { Link } from '@tanstack/react-router';
import { memo, useMemo, useState } from 'react';

import { Icons } from '@/components/icons';
import { ProjectIconBadge } from '@/components/projects/project-icon-color-picker';
import type { ProjectListItemData } from '@/components/projects/project-list-item';
import { ProjectListItem } from '@/components/projects/project-list-item';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

const MAX_VISIBLE_PROJECTS = 5;

type ProjectListProps = {
  projects: ProjectListItemData[];
  onDeleteProject?: (project: ProjectListItemData) => void;
  onCreateProject?: () => void;
  isCreateDisabled?: boolean;
};

function SeeMoreProjectsPopover({
  projects,
}: {
  projects: ProjectListItemData[];
}) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton className="text-muted-foreground">
          <Icons.moreHorizontal className="size-4" />
          <span>{t('projects.seeMore')}</span>
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-64 p-0"
        sideOffset={8}
      >
        <ScrollArea className="max-h-[300px]">
          <div className="p-2">
            {projects.map(project => (
              <Link
                key={project.id}
                to="/chat/projects/$projectId"
                params={{ projectId: project.id }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <ProjectIconBadge
                  icon={project.icon ?? DEFAULT_PROJECT_ICON}
                  color={project.color ?? DEFAULT_PROJECT_COLOR}
                  size="sm"
                />
                <span className="truncate text-sm">{project.name}</span>
              </Link>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function ProjectListComponent({
  projects,
  onDeleteProject,
  onCreateProject,
  isCreateDisabled,
}: ProjectListProps) {
  const t = useTranslations();

  const { visibleProjects, overflowProjects } = useMemo(() => {
    if (projects.length <= MAX_VISIBLE_PROJECTS) {
      return { visibleProjects: projects, overflowProjects: [] };
    }
    return {
      visibleProjects: projects.slice(0, MAX_VISIBLE_PROJECTS),
      overflowProjects: projects.slice(MAX_VISIBLE_PROJECTS),
    };
  }, [projects]);

  return (
    <SidebarMenu>
      {/* New Project item - always first, clickable even when limit reached to show dialog */}
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={onCreateProject}
          className={cn(
            'text-muted-foreground',
            isCreateDisabled
              ? 'opacity-60'
              : 'hover:text-foreground',
          )}
        >
          <Icons.plus className="size-4" />
          <span>{t('projects.newProject')}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>

      {/* Visible projects */}
      {visibleProjects.map(project => (
        <ProjectListItem
          key={project.id}
          project={project}
          onDelete={onDeleteProject}
        />
      ))}

      {/* See more popover for overflow projects */}
      {overflowProjects.length > 0 && (
        <SidebarMenuItem>
          <SeeMoreProjectsPopover projects={overflowProjects} />
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  );
}

export const ProjectList = memo(ProjectListComponent);
