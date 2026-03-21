import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ElevationChart } from './ElevationChart';

// recharts uses ResizeObserver — stub it for jsdom
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ResponsiveContainer measures DOM dimensions — jsdom always returns 0,
// so inject fixed dimensions into the child AreaChart.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children as React.ReactElement<{ width?: number; height?: number }>, { width: 400, height: 160 }),
  };
});

const GPX_WITH_ELEVATION = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"><ele>120</ele></trkpt>
  <trkpt lat="37.501" lon="127.001"><ele>135</ele></trkpt>
  <trkpt lat="37.502" lon="127.002"><ele>148</ele></trkpt>
</trkseg></trk></gpx>`;

const GPX_NO_ELEVATION = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"></trkpt>
  <trkpt lat="37.501" lon="127.001"></trkpt>
</trkseg></trk></gpx>`;

describe('ElevationChart', () => {
  it('renders svg when GPX has valid elevation data', () => {
    const { container } = render(<ElevationChart gpxText={GPX_WITH_ELEVATION} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders nothing when GPX has no elevation data', () => {
    const { container } = render(<ElevationChart gpxText={GPX_NO_ELEVATION} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for invalid GPX', () => {
    const { container } = render(<ElevationChart gpxText="not xml" />);
    expect(container.firstChild).toBeNull();
  });
});
