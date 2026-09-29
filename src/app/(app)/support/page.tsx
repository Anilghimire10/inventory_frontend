import { Suspense } from 'react';
import SupportPage from '@/screens/SupportPage';
import { LoadingBlock } from '@/components/ui/misc';

// SupportPage reads ?ticket= from the URL, which a static export can't know
// ahead of time, so it renders on the client behind this boundary.
export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <SupportPage />
    </Suspense>
  );
}
