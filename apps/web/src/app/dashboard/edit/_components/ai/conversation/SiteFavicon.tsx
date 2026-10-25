'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { GlobeIcon } from '@magic-resume-kit/icons';
import type { CitationSource } from '../types';
import { siteFaviconCandidates } from './citationSources';

export default function SiteFavicon({
  source,
  className = 'size-4 rounded-mr-compact',
  iconSize = 11,
}: {
  source: Pick<CitationSource, 'url' | 'faviconUrl'>;
  className?: string;
  iconSize?: number;
}) {
  const candidates = siteFaviconCandidates(source.url, source.faviconUrl);

  return (
    <span
      className={`bg-mr-surface text-mr-ink-secondary relative grid shrink-0 place-items-center overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <GlobeIcon width={iconSize} height={iconSize} />
      <FaviconImage key={candidates.join('\n')} candidates={candidates} />
    </span>
  );
}

function FaviconImage({ candidates }: { candidates: string[] }) {
  const [{ attempt, loaded }, setImage] = useState({
    attempt: 0,
    loaded: false,
  });
  const src = candidates[attempt];
  const fail = useCallback(
    () =>
      setImage((current) =>
        current.attempt === attempt && !current.loaded
          ? { attempt: attempt + 1, loaded: false }
          : current,
      ),
    [attempt],
  );
  useEffect(() => {
    if (!src || loaded) return;
    // A hanging source must not prevent the remaining fallbacks from loading.
    const timer = setTimeout(fail, 5_000);
    return () => clearTimeout(timer);
  }, [src, loaded, fail]);
  if (!src) return null;
  // Native images avoid Next's optimizer fetching arbitrary source URLs.
  return (
    <img
      key={src}
      src={src}
      alt=""
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      className="absolute inset-0 size-full rounded-[inherit] object-contain"
      onError={fail}
      onLoad={() =>
        setImage((current) =>
          current.attempt === attempt ? { attempt, loaded: true } : current,
        )
      }
    />
  );
}
