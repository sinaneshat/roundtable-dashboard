import type { ProjectColor, ProjectIcon } from '@roundtable/shared';
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON } from '@roundtable/shared';
import { Link, useRouterState } from '@tanstack/react-router';
import { memo } from 'react';

import { Icons } from '@/components/icons';
import { ProjectIconBadge } from '@/components/projects/project-icon-color-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useTranslations } from '@/lib/i18n';

export type ProjectListItemData = {
  id: string;
  name: string;
  color: ProjectColor | null;
  icon: ProjectIcon | null;
  threadCount: number;
};

type ProjectListItemProps = {
  project: ProjectListItemData;
  onDelete?: (project: ProjectListItemData) => void;
};

function ProjectListItemComponent({
  onDelete,
  project,
}: ProjectListItemProps) {
  const t = useTranslations();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const isActive = pathname.includes(`/projects/${project.id}`);

  return (
    <SidebarMenuItem>
      <div className="group/item relative">
        <SidebarMenuButton
          asChild
          isActive={isActive}
          className="pr-1 group-hover/item:pr-8 transition-all duration-150"
        >
          <Link
            to="/chat/projects/$projectId"
            params={{ projectId: project.id }}
            preload="intent"
          >
            <ProjectIconBadge
              icon={project.icon ?? DEFAULT_PROJECT_ICON}
              color={project.color ?? DEFAULT_PROJECT_COLOR}
              size="sm"
            />
            <span className="truncate flex-1">{project.name}</span>
          </Link>
        </SidebarMenuButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction showOnHover>
              <Icons.moreHorizontal className="size-4" />
              <span className="sr-only">{t('actions.more')}</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem asChild>
              <Link to="/chat/projects/$projectId" params={{ projectId: project.id }} search={{ settings: true }}>
                <Icons.pencil className="size-4 mr-2" />
                {t('actions.edit')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete?.(project)}
              className="text-destructive focus:text-destructive"
            >
              <Icons.trash className="size-4 mr-2" />
              {t('actions.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarMenuItem>
  );
}

export const ProjectListItem = memo(ProjectListItemComponent);
