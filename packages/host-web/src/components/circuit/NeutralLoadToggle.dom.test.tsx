import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NeutralLoadToggle } from './NeutralLoadToggle.js';

describe('NeutralLoadToggle (CR-OQ-3)', () => {
  it('hides itself for 1ph2w and 3ph3w', () => {
    const { rerender, queryByTestId } = render(
      <NeutralLoadToggle topology="1ph2w" neutralCarriesCurrent={false} onChange={() => {}} />,
    );
    expect(queryByTestId('neutral-load-toggle')).toBeNull();

    rerender(
      <NeutralLoadToggle topology="3ph3w" neutralCarriesCurrent={false} onChange={() => {}} />,
    );
    expect(queryByTestId('neutral-load-toggle')).toBeNull();
  });

  it('shows for 3ph4w and 1ph3w', () => {
    const { rerender, getByTestId } = render(
      <NeutralLoadToggle topology="3ph4w" neutralCarriesCurrent={false} onChange={() => {}} />,
    );
    expect(getByTestId('neutral-load-toggle')).toBeInTheDocument();

    rerender(
      <NeutralLoadToggle topology="1ph3w" neutralCarriesCurrent={false} onChange={() => {}} />,
    );
    expect(getByTestId('neutral-load-toggle')).toBeInTheDocument();
  });

  it('emits onChange when toggled', async () => {
    const onChange = vi.fn();
    render(
      <NeutralLoadToggle topology="3ph4w" neutralCarriesCurrent={false} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
