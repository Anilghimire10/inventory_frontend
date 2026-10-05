import { Suspense } from 'react';
import InventoryPage from '@/screens/InventoryPage';
import { LoadingBlock } from '@/components/ui/misc';

// InventoryPage reads ?tab= from the URL, which a static export can't know
// ahead of time, so it renders on the client behind this boundary.
export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <InventoryPage />
    </Suspense>
  );
}
