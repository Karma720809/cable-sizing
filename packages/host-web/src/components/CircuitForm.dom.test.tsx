import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CircuitForm,
  INITIAL_FORM,
  buildCircuitInput,
  type FormState,
} from './CircuitForm.js';

function renderTrackedForm(initial: FormState = INITIAL_FORM): {
  user: ReturnType<typeof userEvent.setup>;
  latest: () => FormState;
  submitted: () => unknown;
} {
  const user = userEvent.setup();
  let latestForm = initial;
  let submittedInput: unknown = null;

  function Wrapper(): React.ReactElement {
    const [form, setForm] = React.useState<FormState>(initial);
    latestForm = form;

    return (
      <CircuitForm
        value={form}
        onChange={setForm}
        onSubmit={() => {
          submittedInput = buildCircuitInput(form);
        }}
        busy={false}
      />
    );
  }

  render(<Wrapper />);

  return {
    user,
    latest: () => latestForm,
    submitted: () => submittedInput,
  };
}

describe('CircuitForm phase/topology coherence', () => {
  it('updates 3-phase to 1-phase atomically with a compatible topology', async () => {
    const { user, latest, submitted } = renderTrackedForm({
      ...INITIAL_FORM,
      phase: 3,
      topology: '3ph4w',
    });

    await user.selectOptions(screen.getByLabelText('Phase'), '1');

    await waitFor(() => {
      expect(latest().phase).toBe(1);
      expect(latest().topology).toBe('1ph2w');
    });

    await user.click(screen.getByRole('button', { name: /size cable/i }));
    const input = submitted() as { system: { phase: number; topology: string } };
    expect(input.system).toMatchObject({ phase: 1, topology: '1ph2w' });
  });

  it('updates 1-phase to 3-phase atomically with a compatible topology', async () => {
    const { user, latest } = renderTrackedForm({
      ...INITIAL_FORM,
      phase: 1,
      topology: '1ph2w',
    });

    await user.selectOptions(screen.getByLabelText('Phase'), '3');

    await waitFor(() => {
      expect(latest().phase).toBe(3);
      expect(latest().topology).toBe('3ph4w');
    });
  });

  it('does not leave stale topology after sequential phase changes', async () => {
    const { user, latest } = renderTrackedForm({
      ...INITIAL_FORM,
      phase: 3,
      topology: '3ph4w',
    });

    const phase = screen.getByLabelText('Phase');
    await user.selectOptions(phase, '1');
    await user.selectOptions(phase, '3');

    await waitFor(() => {
      expect(latest().phase).toBe(3);
      expect(latest().topology).toBe('3ph4w');
    });
  });

  it('preserves an existing compatible topology when phase remains compatible', async () => {
    const { user, latest } = renderTrackedForm({
      ...INITIAL_FORM,
      phase: 3,
      topology: '3ph3w',
    });

    await user.selectOptions(screen.getByLabelText('Phase'), '3');

    await waitFor(() => {
      expect(latest().phase).toBe(3);
      expect(latest().topology).toBe('3ph3w');
    });
  });
});
