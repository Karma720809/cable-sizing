import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('auto-selects a compatible method when a multicore method becomes stale for single-core', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ReferenceMethodSelector
        cableType="multicore"
        value="C"
        onChange={onChange}
      />,
    );

    rerender(
      <ReferenceMethodSelector
        cableType="single-core"
        value="C"
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('B1'));
    const select = screen.getByTestId('reference-method-select') as HTMLSelectElement;
    expect(select.value).toBe('B1');
  });

  it('auto-selects a compatible method when a single-core method becomes stale for multicore', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ReferenceMethodSelector
        cableType="single-core"
        value="F"
        onChange={onChange}
      />,
    );

    rerender(
      <ReferenceMethodSelector
        cableType="multicore"
        value="F"
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('B2'));
    const select = screen.getByTestId('reference-method-select') as HTMLSelectElement;
    expect(select.value).toBe('B2');
  });

  it('does not keep a disabled show-all method as the active selection', async () => {
    const onChange = vi.fn();
    render(
      <ReferenceMethodSelector
        cableType="multicore"
        value="F"
        onChange={onChange}
        showAll
      />,
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('B2'));

    const select = screen.getByTestId('reference-method-select') as HTMLSelectElement;
    const opts = within(select).getAllByRole('option') as HTMLOptionElement[];
    const f = opts.find((o) => o.value === 'F')!;
    const selected = opts.find((o) => o.value === select.value)!;
    expect(f.disabled).toBe(true);
    expect(select.value).toBe('B2');
    expect(selected.disabled).toBe(false);
  });

  it('keeps an existing valid method selection when still compatible', () => {
    const onChange = vi.fn();
    render(
      <ReferenceMethodSelector
        cableType="multicore"
        value="E"
        onChange={onChange}
      />,
    );

    const select = screen.getByTestId('reference-method-select') as HTMLSelectElement;
    expect(select.value).toBe('E');
    expect(onChange).not.toHaveBeenCalled();
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
