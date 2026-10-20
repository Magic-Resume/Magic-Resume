import type { ReactNode } from 'react';

export type ReleaseAction = { label: string; href: string };

export type ReleaseSlide = {
  id: string;
  category: 'New feature' | 'Improvement';
  title: string;
  description: string;
  highlights: string[];
  image?: { src: string; alt: string };
  media?: ReactNode;
  action?: ReleaseAction;
};

export type Release = {
  label: string;
  date: string;
  summary: string;
  slides: [ReleaseSlide, ...ReleaseSlide[]];
  changelog?: ReleaseAction;
};
