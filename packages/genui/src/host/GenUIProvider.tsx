'use client';

import React, { createContext, useContext, useMemo } from 'react';
import type { GenUIDataSource } from '../contract';

interface GenUIContextValue {
  sources: Record<string, GenUIDataSource>;
}

const GenUIContext = createContext<GenUIContextValue>({ sources: {} });

/**
 * Supplies the option lists search fields query.
 *
 * The data lives in the host app, not here: school and company lists are its
 * business, and a component library that shipped them would be a content
 * package pretending to be a UI one. Sources load lazily, so a 3,000-entry
 * dictionary costs nothing until a card that needs it is actually shown.
 */
export function GenUIProvider({
  sources,
  children,
}: {
  sources: Record<string, GenUIDataSource>;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ sources }), [sources]);
  return <GenUIContext.Provider value={value}>{children}</GenUIContext.Provider>;
}

/** The source registered under `id`, or undefined — callers degrade to free text. */
export function useGenUISource(id?: string): GenUIDataSource | undefined {
  const { sources } = useContext(GenUIContext);
  return id ? sources[id] : undefined;
}
