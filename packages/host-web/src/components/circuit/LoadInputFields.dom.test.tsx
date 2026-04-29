import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoadInputFields, type LoadValues } from './LoadInputFields.js';

const baseValues: LoadValues = {
  loadType: 'general',
  powerKW: 100,
  fla: 50,
  kva: 250,
};

describe('LoadInputFields (CR-OQ-1)', () => {
  it('general: shows P_kW only — no FLA, no kVA fields (AC-1)', () => {
    render(<LoadInputFields values={baseValues} onChange={() => {}} />);
    expect(screen.getByTestId('load-powerkw')).toBeInTheDocument();
    expect(screen.queryByTestId('load-fla')).toBeNull();
    expect(screen.queryByTestId('load-kva')).toBeNull();
  });

  it('motor: shows FLA primary, hides standalone P_kW field', () => {
    render(
      <LoadInputFields values={{ ...baseValues, loadType: 'motor' }} onChange={() => {}} />,
    );
    expect(screen.getByTestId('load-fla')).toBeInTheDocument();
    expect(screen.queryByTestId('load-powerkw')).toBeNull();
    // P_kW remains accessible in the fallback details.
    expect(screen.getByTestId('load-powerkw-fallback')).toBeInTheDocument();
  });

  it('transformer: shows kVA only — hides P_kW and FLA', () => {
    render(
      <LoadInputFields
        values={{ ...baseValues, loadType: 'transformer' }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('load-kva')).toBeInTheDocument();
    expect(screen.queryByTestId('load-powerkw')).toBeNull();
    expect(screen.queryByTestId('load-fla')).toBeNull();
  });

  it('emits patch updates on edit', () => {
    const onChange = vi.fn();
    render(
      <LoadInputFields values={{ ...baseValues, loadType: 'transformer' }} onChange={onChange} />,
    );
    const kva = screen.getByTestId('load-kva') as HTMLInputElement;
    fireEvent.change(kva, { target: { value: '500' } });
    expect(onChange).toHaveBeenLastCalledWith({ kva: 500 });
  });

  it('emits loadType patch on type change', async () => {
    const onChange = vi.fn();
    render(<LoadInputFields values={baseValues} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByTestId('load-type-select'), 'transformer');
    expect(onChange).toHaveBeenCalledWith({ loadType: 'transformer' });
  });
});
