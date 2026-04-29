import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReferenceMethodSelector } from './ReferenceMethodSelector.js';

describe('ReferenceMethodSelector — Hybrid (CR-OQ-6)', () => {
  it('default view hides single-core-only methods when cableType=multicore', () => {
    render(
      <ReferenceMethodSelector
        cableType="multicore"
        value="C"
        onChange={() => {}}
      />,
    );
    const select = screen.getByTestId('reference-method-select') as HTMLSelectElement;
    const options = within(select).getAllByRole('option') as HTMLOptionElement[];
    const codes = options.map((o) => o.value);
    expect(codes).toContain('C');
    expect(codes).toContain('B2');
    expect(codes).not.toContain('F');
    expect(codes).not.toContain('G');
    expect(codes).not.toContain('A1');
  });

  it('show-all toggle reveals every method', async () => {
    const onChange = vi.fn();
    render(
      <ReferenceMethodSelector
        cableType="multicore"
        value="C"
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByTestId('reference-method-show-all'));
    const options = within(
      screen.getByTestId('reference-method-select'),
    ).getAllByRole('option') as HTMLOptionElement[];
    const codes = options.map((o) => o.value);
    for (const c of ['A1', 'A2', 'B1', 'B2', 'C', 'D1', 'D2', 'E', 'F', 'G']) {
      expect(codes).toContain(c);
    }
  });

  it('show-all flags incompatible options as disabled with a tooltip', async () => {
    render(
      <ReferenceMethodSelector
        cableType="multicore"
        value="C"
        onChange={() => {}}
      />,
    );
    await userEvent.click(screen.getByTestId('reference-method-show-all'));
    const opts = within(
      screen.getByTestId('reference-method-select'),
    ).getAllByRole('option') as HTMLOptionElement[];
    const f = opts.find((o) => o.value === 'F')!;
    expect(f.disabled).toBe(true);
    expect(f.title).toMatch(/single-core/);
    const c = opts.find((o) => o.value === 'C')!;
    expect(c.disabled).toBe(false);
  });

  it('preserves the currently selected value even when filter would hide it', () => {
    // cableType=multicore but value=F (single-core method) — selector still shows F
    // so the user is not confused by an empty/wrong selection.
    render(
      <ReferenceMethodSelector
        cableType="multicore"
        value="F"
        onChange={() => {}}
      />,
    );
    const opts = within(
      screen.getByTestId('reference-method-select'),
    ).getAllByRole('option') as HTMLOptionElement[];
    expect(opts.some((o) => o.value === 'F')).toBe(true);
  });

  it('emits the selected method via onChange', async () => {
    const onChange = vi.fn();
    render(
      <ReferenceMethodSelector
        cableType="multicore"
        value="C"
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByTestId('reference-method-select'), 'D2');
    expect(onChange).toHaveBeenCalledWith('D2');
  });
});
