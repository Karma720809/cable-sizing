import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SourceIcon } from './SourceIcon.js';
import type { FieldSource } from '@cable-sizing/engine';

const ALL_SOURCES: FieldSource[] = [
  'auto_formula',
  'auto_dataset',
  'user',
  'override',
  'legacy_preserved',
];

describe('SourceIcon', () => {
  it.each(ALL_SOURCES)('renders an svg with a tooltip title for %s', (source) => {
    const { getByTestId, getByText } = render(<SourceIcon source={source} />);
    const svg = getByTestId(`source-icon-${source}`);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    // role=img + aria-label provides a screen-reader hook.
    expect(svg.getAttribute('aria-label')).toBeTruthy();
    // <title> child provides the hover tooltip.
    expect(getByText(svg.getAttribute('aria-label')!)).toBeInTheDocument();
  });

  it('honours the size prop', () => {
    const { getByTestId } = render(<SourceIcon source="user" size={24} />);
    const svg = getByTestId('source-icon-user');
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
  });

  it('appends source-specific class names', () => {
    const { getByTestId } = render(<SourceIcon source="override" className="extra" />);
    const cls = getByTestId('source-icon-override').getAttribute('class') ?? '';
    expect(cls).toContain('source-icon');
    expect(cls).toContain('source-icon-override');
    expect(cls).toContain('extra');
  });
});
