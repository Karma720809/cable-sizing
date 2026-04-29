import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatusBadge } from './StatusBadge.js';
import type { FieldStatus } from '@cable-sizing/engine';

const ALL: FieldStatus[] = ['valid', 'unavailable', 'incomplete', 'invalid'];

describe('StatusBadge', () => {
  it.each(ALL)('renders default label for %s', (s) => {
    const { getByTestId } = render(<StatusBadge status={s} />);
    const el = getByTestId(`status-badge-${s}`);
    expect(el.textContent).toMatch(/[A-Z]/);
    expect(el.getAttribute('data-status')).toBe(s);
  });

  it('shows N/A for unavailable', () => {
    const { getByTestId } = render(<StatusBadge status="unavailable" />);
    expect(getByTestId('status-badge-unavailable').textContent).toBe('N/A');
  });

  it('renders custom label when provided', () => {
    const { getByTestId } = render(<StatusBadge status="invalid" label="OUT OF RANGE" />);
    expect(getByTestId('status-badge-invalid').textContent).toBe('OUT OF RANGE');
  });

  it('exposes a tooltip via title', () => {
    const { getByTestId } = render(<StatusBadge status="incomplete" />);
    expect(getByTestId('status-badge-incomplete').getAttribute('title')).toMatch(/missing/);
  });
});
