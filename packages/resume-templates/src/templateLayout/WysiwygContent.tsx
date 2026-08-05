import React from 'react';
import DOMPurify from 'dompurify';

interface Props {
  dirtyHtml: string;
  className?: string;
}

export function WysiwygContent({ dirtyHtml, className }: Props) {
  if (typeof window === 'undefined') {
    return <div className={className} />;
  }
  const cleanHtml = DOMPurify.sanitize(dirtyHtml);
  return (
    <div
      className={`wysiwyg ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
      style={{
        boxSizing: 'border-box',
        color: 'inherit',
        display: 'block',
        maxWidth: '100%',
        minWidth: 0,
        overflowWrap: 'anywhere',
        whiteSpace: 'normal',
        width: '100%',
        wordBreak: 'break-word',
        lineHeight: 'max(1.5, var(--line-height, 1.5))',
      }}
    />
  );
}
