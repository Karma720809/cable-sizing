import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { handleWorkerMessage } from '@cable-sizing/engine';
import { App } from './App.js';

const worker = vi.hoisted(() => ({
  ping: vi.fn(),
  manifest: vi.fn(),
  sizeCable: vi.fn(),
  sizeCableMv: vi.fn(),
  validate: vi.fn(),
}));

vi.mock('./hooks/useEngineWorker.js', () => ({
  useEngineWorker: () => ({
    ready: true,
    ping: worker.ping,
    manifest: worker.manifest,
    sizeCable: worker.sizeCable,
    sizeCableMv: worker.sizeCableMv,
    validate: worker.validate,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  worker.ping.mockResolvedValue({
    ok: true,
    type: 'pong',
    requestId: 'ping',
    data: { engineVersion: 'test', apiVersion: 1 },
  });
  worker.manifest.mockResolvedValue(handleWorkerMessage({ id: 'manifest', type: 'manifest' }));
  worker.sizeCable.mockImplementation((input: unknown) =>
    Promise.resolve(handleWorkerMessage({ id: 'size', type: 'sizeCable', input })),
  );
  worker.sizeCableMv.mockResolvedValue({
    ok: false,
    type: 'error',
    requestId: 'mv-size',
    error: { code: 'E-TEST', message: 'MV sizing is not used in this test' },
  });
  worker.validate.mockResolvedValue({
    ok: true,
    type: 'validate:result',
    requestId: 'validate',
    data: { valid: true },
  });
});

describe('App stale result handling', () => {
  it('clears completed result-derived displays when Motor power changes, then shows a fresh result after rerun', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByTestId('load-type-select'), 'motor');
    await user.click(screen.getByRole('button', { name: /size cable/i }));

    expect(await screen.findByTestId('recommended-csa')).toBeInTheDocument();
    expect(screen.getByTestId('derived-field-design-current-ib')).toBeInTheDocument();

    const motorPower = screen.getByTestId('load-powerkw-fallback');
    await user.clear(motorPower);
    await user.type(motorPower, '75');

    await waitFor(() => {
      expect(screen.queryByTestId('derived-field-design-current-ib')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recommended-csa')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /size cable/i }));

    expect(await screen.findByTestId('recommended-csa')).toBeInTheDocument();
    expect(screen.getByTestId('derived-field-design-current-ib')).toBeInTheDocument();
  });

  it('clears loaded-conductor and result-panel values when topology changes', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /size cable/i }));

    expect(await screen.findByTestId('recommended-csa')).toBeInTheDocument();
    expect(screen.getByTestId('derived-field-loaded-conductors')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Topology'), '3ph3w');

    await waitFor(() => {
      expect(screen.queryByTestId('derived-field-loaded-conductors')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recommended-csa')).not.toBeInTheDocument();
    });
  });

  it('clears reference-dependent result values when cable type changes', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /size cable/i }));

    expect(await screen.findByTestId('recommended-csa')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Cable type'), 'single-core');

    await waitFor(() => {
      expect(screen.queryByTestId('recommended-csa')).not.toBeInTheDocument();
    });
  });
});

describe('App short-circuit omission UX', () => {
  it('toggle off submits null short-circuit values and does not show zero-value validation errors', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByLabelText('Evaluate short-circuit withstand'));
    await user.click(screen.getByRole('button', { name: /size cable/i }));

    await waitFor(() => {
      expect(worker.sizeCable).toHaveBeenCalled();
    });
    const input = worker.sizeCable.mock.calls.at(-1)?.[0] as {
      protection: { shortCircuitKA: number | null; tripTimeS: number | null };
    };
    expect(input.protection.shortCircuitKA).toBeNull();
    expect(input.protection.tripTimeS).toBeNull();
    expect(await screen.findByTestId('recommended-csa')).toBeInTheDocument();
    expect(screen.queryByText('E-VAL-011')).not.toBeInTheDocument();
    expect(screen.queryByText('E-VAL-012')).not.toBeInTheDocument();
  });

  it('toggle on with Isc = 0 shows invalid short-circuit current', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText('Isc (kA)'));
    await user.click(screen.getByRole('button', { name: /size cable/i }));

    expect(await screen.findByTestId('errors')).toBeInTheDocument();
    expect(screen.getByText('E-VAL-011')).toBeInTheDocument();
  });

  it('toggle on with tripTimeS = 0 shows invalid trip time', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText('Trip time (s)'));
    await user.click(screen.getByRole('button', { name: /size cable/i }));

    expect(await screen.findByTestId('errors')).toBeInTheDocument();
    expect(screen.getByText('E-VAL-012')).toBeInTheDocument();
  });

  it('toggle on with Isc = 1 and tripTimeS = 0.1 is valid', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText('Isc (kA)'));
    await user.type(screen.getByLabelText('Isc (kA)'), '1');
    await user.clear(screen.getByLabelText('Trip time (s)'));
    await user.type(screen.getByLabelText('Trip time (s)'), '0.1');
    await user.click(screen.getByRole('button', { name: /size cable/i }));

    expect(await screen.findByTestId('recommended-csa')).toBeInTheDocument();
    expect(screen.queryByText('E-VAL-011')).not.toBeInTheDocument();
    expect(screen.queryByText('E-VAL-012')).not.toBeInTheDocument();
  });
});
