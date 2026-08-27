"use client";

import React from "react";
import { GlobeIcon } from '@magic-resume/icons';
import type { CitationSource } from "../types";
import { siteFaviconUrl } from "./citationSources";

export default function SiteFavicon({
  source,
  className = "size-4 rounded-[5px]",
  iconSize = 11,
}: {
  source: Pick<CitationSource, "url" | "faviconUrl">;
  className?: string;
  iconSize?: number;
}) {
  const faviconUrl = siteFaviconUrl(source.url, source.faviconUrl);

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden bg-accent-tint text-accent-ink ${className}`}
      aria-hidden="true"
    >
      <GlobeIcon width={iconSize} height={iconSize} />
      {faviconUrl ? (
        // Native img is intentional: arbitrary source domains must not pass through
        // Next Image's server-side optimizer. Broken icons reveal the globe below.
        <img
          key={faviconUrl}
          src={faviconUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          className="absolute inset-0 size-full rounded-[inherit] bg-raised object-contain p-px"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}
