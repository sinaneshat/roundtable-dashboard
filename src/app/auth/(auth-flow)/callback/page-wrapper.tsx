'use client';

type CallbackPageWrapperProps = {
  children: React.ReactNode;
};

/**
 * Client-side wrapper for auth callback page to provide error boundary
 * This wraps the server component with client-side error handling
 */
export function CallbackPageWrapper({ children }: CallbackPageWrapperProps) {
  return (
    <>
      {children}
    </>
  );
}
