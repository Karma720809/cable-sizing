/**
 * SourceIcon — 5-way visual cue for FieldState.source.
 *
 * Inline SVG (no icon library — keeps host-web zero-dep beyond React).
 * Glyphs map to lucide-react names called out in Implementation_Spec §4.1
 * (Settings / Database / Edit / AlertTriangle / Archive) but trimmed to
 * monochrome 16-px paths so the form/audit panels render predictably.
 */
import React from 'react';
import type { FieldSource } from '@cable-sizing/engine';

const TITLES: Record<FieldSource, string> = {
  auto_formula: 'Auto-derived from formula',
  auto_dataset: 'Auto-resolved from dataset',
  user: 'User input',
  override: 'User override of an auto value',
  legacy_preserved: 'Preserved from a v1.x project (no recalculation)',
};

interface Props {
  source: FieldSource;
  size?: number;
  className?: string;
}

export function SourceIcon({ source, size = 14, className }: Props): React.ReactElement {
  const title = TITLES[source];
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    role: 'img',
    'aria-label': title,
    className: ['source-icon', `source-icon-${source}`, className].filter(Boolean).join(' '),
  };

  // Each glyph is a single <g> hand-tuned to read at 14×14.
  switch (source) {
    case 'auto_formula':
      // Settings/gear — 6-tooth wheel + center dot.
      return (
        <svg {...common} data-testid={`source-icon-${source}`}>
          <title>{title}</title>
          <circle cx="8" cy="8" r="2" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
        </svg>
      );
    case 'auto_dataset':
      // Database — three stacked ellipses.
      return (
        <svg {...common} data-testid={`source-icon-${source}`}>
          <title>{title}</title>
          <ellipse cx="8" cy="3.5" rx="5" ry="1.6" />
          <path d="M3 3.5v9c0 .9 2.2 1.6 5 1.6s5-.7 5-1.6v-9" />
          <path d="M3 8c0 .9 2.2 1.6 5 1.6s5-.7 5-1.6" />
        </svg>
      );
    case 'user':
      // Edit/pencil.
      return (
        <svg {...common} data-testid={`source-icon-${source}`}>
          <title>{title}</title>
          <path d="M11.3 2.3a1.4 1.4 0 0 1 2 2L5.5 12.1l-2.7.6.6-2.7z" />
          <path d="M10 3.6l2.4 2.4" />
        </svg>
      );
    case 'override':
      // AlertTriangle.
      return (
        <svg {...common} data-testid={`source-icon-${source}`}>
          <title>{title}</title>
          <path d="M8 1.8L14.6 13H1.4z" />
          <path d="M8 6v3.5" />
          <circle cx="8" cy="11.4" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'legacy_preserved':
      // Archive box.
      return (
        <svg {...common} data-testid={`source-icon-${source}`}>
          <title>{title}</title>
          <rect x="2" y="3" width="12" height="3" rx="0.5" />
          <path d="M3 6v7h10V6" />
          <path d="M6.5 9h3" />
        </svg>
      );
  }
}
