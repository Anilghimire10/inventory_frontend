'use client';
import dynamic from 'next/dynamic';
import type { BarsChartProps, DonutChartProps, TrendChartProps } from './Charts';

// recharts is the biggest library in the app and only the Dashboard and
// Analytics draw charts, so it loads on demand instead of with every page.
// Until it arrives, a placeholder of the chart's own height keeps the page
// from jumping.

const placeholder = () => <div className="h-full w-full animate-pulse rounded-md bg-muted/50" />;

const LazyTrend = dynamic(() => import('./Charts').then((m) => m.TrendChart), { ssr: false, loading: placeholder });
const LazyBars = dynamic(() => import('./Charts').then((m) => m.BarsChart), { ssr: false, loading: placeholder });
const LazyDonut = dynamic(() => import('./Charts').then((m) => m.DonutChart), { ssr: false, loading: placeholder });

export function TrendChart(props: TrendChartProps) {
  return (
    <div style={{ height: props.height }}>
      <LazyTrend {...props} />
    </div>
  );
}

export function BarsChart(props: BarsChartProps) {
  return (
    <div style={{ height: props.height }}>
      <LazyBars {...props} />
    </div>
  );
}

export function DonutChart(props: DonutChartProps) {
  return (
    <div style={{ height: props.height }}>
      <LazyDonut {...props} />
    </div>
  );
}
