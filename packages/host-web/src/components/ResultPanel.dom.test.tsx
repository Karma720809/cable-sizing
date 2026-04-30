/**
 * ResultPanel DOM tests — App-MVP-1 critical-path coverage.
 *
 * Strategy: feed the panel real WorkerResponse envelopes produced by the
 * engine's own `handleWorkerMessage` (same trick as the host smoke test),
 * and assert the user-visible surfaces that App-MVP-1 contracts into its
 * scope (I-2 + O-2 + E-2 + Stage 5C new fields).
 *
 * Why not test <App /> end-to-end? App constructs a real Worker via
 * `new Worker(new URL(...))`, which is not supported under jsdom. The
 * smoke test in `smoke.test.ts` already exercises the form → engine →
 * response round-trip in Node; the DOM tests here are about render
 * contract, not worker plumbing.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { handleWorkerMessage } from '@cable-sizing/engine';
import { ResultPanel } from './ResultPanel.js';
import { DiagnosticsPanel } from './DiagnosticsPanel.js';
import {
  CircuitForm,
  INITIAL_FORM,
  buildCircuitInput,
  type FormState,
} from './CircuitForm.js';

// Helper: run the real engine against a form state and return the
// envelope the panel would receive from the worker.
function runEngine(form: FormState = INITIAL_FORM) {
  return handleWorkerMessage({
    id: 'dom-test',
    type: 'sizeCable',
    input: buildCircuitInput(form),
  });
}

function resultFrom(form: FormState = INITIAL_FORM) {
  const res = runEngine(form);
  if (!(res.ok && res.type === 'sizeCable:result')) throw new Error('expected LV result');
  return res.data.result;
}

describe('ResultPanel — default form', () => {
  it('renders recommended CSA, overall status, and all four criteria rows', () => {
    const res = runEngine();
    render(<ResultPanel res={res} />);

    // Hero CSA has a mm² unit and a positive number.
    const csa = screen.getByTestId('recommended-csa');
    expect(csa.textContent).toMatch(/\d+\s*mm²/);

    // Criteria table has the four expected rows.
    const table = screen.getByRole('table', { name: /criteria/i });
    expect(within(table).getByText(/Ampacity/)).toBeInTheDocument();
    expect(within(table).getByText(/Voltage drop/)).toBeInTheDocument();
    expect(within(table).getByText(/Short-circuit/)).toBeInTheDocument();
    expect(within(table).getByText(/Protection coord\./)).toBeInTheDocument();
  });

  it('audit trail is present and has ≥ 1 step', () => {
    const res = runEngine();
    render(<ResultPanel res={res} />);
    const audit = screen.getByTestId('audit-trail');
    // Summary text carries the step count: "Audit trail (N steps)"
    expect(audit.textContent).toMatch(/Audit trail \(\d+ steps\)/);
  });
});

describe('ResultPanel — temperature-corrected resistance (Stage 5C)', () => {
  it('renders the θ_op block only when resistanceModel is temperature_corrected', () => {
    // fixed_reference (default): no temp block.
    const { rerender } = render(<ResultPanel res={runEngine()} />);
    expect(screen.queryByTestId('temp-correction-block')).not.toBeInTheDocument();

    // temperature_corrected: block appears with θ_op and both R values.
    const tcRes = runEngine({ ...INITIAL_FORM, resistanceModel: 'temperature_corrected' });
    rerender(<ResultPanel res={tcRes} />);
    const block = screen.getByTestId('temp-correction-block');
    expect(within(block).getByText(/θ_op \(estimated\)/)).toBeInTheDocument();
    expect(within(block).getByText(/R @ reference/)).toBeInTheDocument();
    expect(within(block).getByText(/R @ θ_op/)).toBeInTheDocument();
  });
});

describe('ResultPanel — code chip tooltips (E-2)', () => {
  it('renders warning codes with a hint tooltip (title attribute)', () => {
    // Default form has W-I2-MISSING unless I2 is set — but the form already
    // defaults I2 from In. Force a 60 Hz single-core request to get
    // W-REACTANCE-60HZ-DEFERRED / W-RESISTANCE-50HZ-USED-AT-60HZ which are
    // deterministic with respect to the bundled datasets.
    const res = runEngine({
      ...INITIAL_FORM,
      frequencyHz: 60,
      cableType: 'single-core',
      methodCode: 'F',
      useReactance: true,
    });
    render(<ResultPanel res={res} />);
    const codeEls = document.querySelectorAll('.code-chip');
    expect(codeEls.length).toBeGreaterThan(0);
    // Every code chip has a title (= tooltip hint).
    for (const el of codeEls) {
      expect(el.getAttribute('title')).toBeTruthy();
    }
  });
});

describe('ResultPanel and DiagnosticsPanel — incomplete result display', () => {
  it('does not render skeleton k defaults as normal ResultPanel values', () => {
    const res = runEngine({ ...INITIAL_FORM, loadType: 'transformer', kva: 0 });
    render(<ResultPanel res={res} />);

    const table = screen.getByRole('table', { name: /criteria/i });
    expect(table.textContent).not.toContain('k = 0');
    expect(table.textContent).not.toContain('1.000');
    expect(within(table).getAllByText(/Not evaluated/i).length).toBeGreaterThan(0);
  });

  it('does not render correction factors as evaluated in DiagnosticsPanel for skeleton results', () => {
    const result = resultFrom({ ...INITIAL_FORM, loadType: 'transformer', kva: 0 });
    render(<DiagnosticsPanel pong={null} manifest={null} lastResult={result} />);

    expect(screen.getByText(/Not evaluated/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('1 · 1 · 1 = 1.000');
  });

  it('preserves normal k_total and short-circuit k display for completed results', () => {
    const result = resultFrom();
    const { rerender } = render(<ResultPanel res={runEngine()} />);

    const table = screen.getByRole('table', { name: /criteria/i });
    expect(table.textContent).toContain(result.ampacity.correctionFactors.total.toFixed(3));
    expect(table.textContent).toContain(`k = ${result.shortCircuit.kValue}`);

    rerender(<DiagnosticsPanel pong={null} manifest={null} lastResult={result} />);
    expect(document.body.textContent).toContain(
      result.ampacity.correctionFactors.total.toFixed(3),
    );
  });
});

describe('CircuitForm → ResultPanel — integration via userEvent', () => {
  it('typing a new length and submitting yields an updated result', async () => {
    const user = userEvent.setup();

    // Minimal controlled wrapper: keep form state + latest result in React.
    function Wrapper(): React.ReactElement {
      const [form, setForm] = React.useState<FormState>(INITIAL_FORM);
      const [res, setRes] = React.useState<ReturnType<typeof runEngine> | null>(null);
      return (
        <>
          <CircuitForm
            value={form}
            onChange={setForm}
            onSubmit={() => setRes(runEngine(form))}
            busy={false}
          />
          <ResultPanel res={res} />
        </>
      );
    }

    render(<Wrapper />);

    // Sanity: no result yet.
    expect(screen.queryByTestId('recommended-csa')).not.toBeInTheDocument();

    // Change Length to a very long 500 m, submit, observe a larger csa
    // than the default 50 m run (ΔU% criterion bites harder at 500 m).
    const lengthInput = screen.getByLabelText(/Length, one-way/i);
    await user.clear(lengthInput);
    await user.type(lengthInput, '500');

    await user.click(screen.getByRole('button', { name: /size cable/i }));

    const csaLong = screen.getByTestId('recommended-csa');
    const csaLongMm2 = Number(csaLong.textContent?.match(/(\d+)/)?.[1] ?? 0);

    // Independently compute the default 50 m csa by re-running the engine —
    // no need to render a second panel, which would duplicate test IDs.
    const shortRes = runEngine();
    const shortResultCsa =
      shortRes.ok && shortRes.type === 'sizeCable:result'
        ? shortRes.data.result.recommendedCSAmm2
        : null;
    expect(shortResultCsa).not.toBeNull();
    expect(csaLongMm2).toBeGreaterThanOrEqual(shortResultCsa!);
  });
});
