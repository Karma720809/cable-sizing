import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DerivedFieldDisplay } from './DerivedFieldDisplay.js';
import { FieldStateBuilder } from '@cable-sizing/engine';

describe('DerivedFieldDisplay', () => {
  it('renders auto_formula state with value, unit, source icon and OK badge', () => {
    const state = FieldStateBuilder.autoFormula(126.064, 'IB_3PH_KW', { powerKW: 75 });
    const { getByTestId } = render(
      <DerivedFieldDisplay label="Design current" state={state} unit="A" />
    );

    const row = getByTestId('derived-field-design-current');
    expect(row.textContent).toContain('126.06');
    expect(row.textContent).toContain('A');
    expect(row.getAttribute('data-source')).toBe('auto_formula');
    expect(row.getAttribute('data-status')).toBe('valid');
    expect(getByTestId('source-icon-auto_formula')).toBeInTheDocument();
    expect(getByTestId('status-badge-valid')).toBeInTheDocument();
    // Subtitle exposes formula reference.
    expect(row.textContent).toMatch(/IB_3PH_KW/);
  });

  it('renders override state with the AlertTriangle icon and override label', () => {
    const state = FieldStateBuilder.override(140);
    const { getByTestId } = render(
      <DerivedFieldDisplay label="Design current" state={state} unit="A" />
    );
    const row = getByTestId('derived-field-design-current');
    expect(row.getAttribute('data-source')).toBe('override');
    expect(row.textContent).toMatch(/override applied/i);
  });

  it('renders incomplete state with em-dash value', () => {
    const state = FieldStateBuilder.incomplete('missing_input');
    const { getByTestId } = render(
      <DerivedFieldDisplay label="Design current" state={state} unit="A" />
    );
    const row = getByTestId('derived-field-design-current');
    expect(row.textContent).toContain('—');
    expect(row.getAttribute('data-status')).toBe('incomplete');
    expect(row.textContent).toMatch(/missing upstream input/i);
  });

  it('renders unavailable state without a unit suffix', () => {
    const state = FieldStateBuilder.unavailable('not_applicable');
    const { getByTestId } = render(
      <DerivedFieldDisplay label="Armour CSA" state={state} unit="mm²" />
    );
    const row = getByTestId('derived-field-armour-csa');
    // Unavailable → value is null → "—" with no "mm²" tail.
    expect(row.textContent).toContain('—');
    expect(row.textContent).not.toMatch(/— mm²/);
  });

  it('uses custom formatter when provided', () => {
    const state = FieldStateBuilder.autoFormula(3, 'LOADED_CONDUCTORS', {});
    const { getByTestId } = render(
      <DerivedFieldDisplay
        label="Loaded conductors"
        state={state}
        formatter={(n) => `${n} loaded`}
      />
    );
    expect(getByTestId('derived-field-loaded-conductors').textContent).toMatch(/3 loaded/);
  });
});
