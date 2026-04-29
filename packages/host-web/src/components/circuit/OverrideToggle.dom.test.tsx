import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverrideToggle } from './OverrideToggle.js';

describe('OverrideToggle', () => {
  const baseProps = {
    fieldId: 'designCurrent',
    label: 'Override IB',
    value: 145,
    unit: 'A',
  };

  it('hides the numeric input while disabled and shows the autoHint', () => {
    render(
      <OverrideToggle
        {...baseProps}
        enabled={false}
        onToggle={() => {}}
        onValueChange={() => {}}
        autoHint="126.06 A"
      />,
    );
    expect(screen.queryByTestId('override-input-designCurrent')).toBeNull();
    expect(screen.getByTestId('override-hint-designCurrent').textContent).toMatch(
      /Auto: 126.06 A/,
    );
  });

  it('reveals the numeric input when enabled', () => {
    render(
      <OverrideToggle
        {...baseProps}
        enabled
        onToggle={() => {}}
        onValueChange={() => {}}
      />,
    );
    const input = screen.getByTestId('override-input-designCurrent') as HTMLInputElement;
    expect(input.value).toBe('145');
  });

  it('fires onToggle when the checkbox flips', async () => {
    const onToggle = vi.fn();
    render(
      <OverrideToggle
        {...baseProps}
        enabled={false}
        onToggle={onToggle}
        onValueChange={() => {}}
      />,
    );
    const cb = screen.getByRole('checkbox');
    await userEvent.click(cb);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('emits numeric edits via onValueChange', () => {
    const onValueChange = vi.fn();
    render(
      <OverrideToggle
        {...baseProps}
        enabled
        onToggle={() => {}}
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByTestId('override-input-designCurrent') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '180' } });
    expect(onValueChange).toHaveBeenLastCalledWith(180);
  });
});
