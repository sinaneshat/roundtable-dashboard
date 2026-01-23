import { createFileRoute } from '@tanstack/react-router';

import ProjectChatScreen from '@/containers/screens/projects/ProjectChatScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { projectQueryOptions } from '@/lib/data/query-options';
import type { GetProjectResponse } from '@/services/api';

export const Route = createFileRoute('/_protected/chat/projects/$projectId/new')({
  staleTime: 0,

  loader: async ({ params, context }) => {
    const { queryClient } = context;

    if (!params.projectId) {
      return { project: null, projectName: null };
    }

    const options = projectQueryOptions(params.projectId);

    try {
      await queryClient.ensureQueryData(options);
    } catch (error) {
      console.error('[ProjectChat] Loader error:', error);
      return { project: null, projectName: null };
    }

    const cachedData = queryClient.getQueryData<GetProjectResponse>(options.queryKey);
    const project = cachedData?.success ? cachedData.data : null;

    return {
      project,
      projectName: project?.name ?? null,
    };
  },

  head: ({ loaderData }) => {
    const siteUrl = getAppBaseUrl();
    const displayTitle = loaderData?.projectName
      ? `New Chat - ${loaderData.projectName} - Roundtable`
      : 'New Chat - Roundtable';

    return {
      meta: [
        { title: displayTitle },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/chat` },
      ],
    };
  },

  component: ProjectChatRoute,
});

function ProjectChatRoute() {
  const { projectId } = Route.useParams();
  const loaderData = Route.useLoaderData();

  return (
    <div className="flex flex-col flex-1">
      <ProjectChatScreen
        projectId={projectId}
        project={loaderData?.project ?? null}
      />
    </div>
  );
}
