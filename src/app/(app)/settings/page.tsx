import { Suspense } from 'react';
import SettingsPage from '@/screens/SettingsPage';
import { LoadingBlock } from '@/components/ui/misc';

// SettingsPage reads ?tab= from the URL, which a static export can't know
// ahead of time, so it renders on the client behind this boundary.
export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <SettingsPage />
    </Suspense>
  );
}
