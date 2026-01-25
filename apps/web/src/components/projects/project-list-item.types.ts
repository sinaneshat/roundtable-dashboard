export type ProjectThread = {
  id: string;
  title: string;
  slug: string;
  previousSlug?: string | null;
};

export type ProjectThreadItemProps = {
  thread: ProjectThread;
  projectId: string;
  onShare?: (thread: Pick<ProjectThread, 'id' | 'slug'>) => void;
};
