'use client';

import ErrorScreen from '@/containers/screens/errors/ErrorScreen';

export const dynamic = 'force-dynamic';

type GlobalErrorProps = {
  reset: () => void;
};

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body>
        <ErrorScreen reset={reset} />
      </body>
    </html>
  );
}
