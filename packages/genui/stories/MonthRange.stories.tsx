import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { MonthRange } from '../src/primitives/MonthRange';
import { GenUIProvider } from '../src/host/GenUIProvider';

function ControlledRange() {
  const [value, setValue] = useState('');
  return (
    <GenUIProvider sources={{}} popoverZIndex={120}>
      <div
        style={{
          position: 'relative',
          zIndex: 101,
          minHeight: 400,
          background: '#171717',
          padding: 24,
        }}
      >
        <MonthRange
          value={value}
          onChange={setValue}
          currentYear={2026}
          presentLabel="Present"
        />
        <output aria-label="Saved dates">{value}</output>
        <button onClick={() => setValue('2019.09 - 2023.06')}>
          Load stored dates
        </button>
        <button onClick={() => setValue('')}>Clear dates</button>
      </div>
    </GenUIProvider>
  );
}

const meta = {
  title: 'Agent / MonthRange',
  render: () => <ControlledRange />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyToComplete: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const years = canvas.getAllByRole('button', {
      name: 'aiLab.widgets.field.year',
    });
    const months = canvas.getAllByRole('button', {
      name: 'aiLab.widgets.field.month',
    });
    await userEvent.click(years[0]);
    await userEvent.click(page.getByRole('option', { name: '2022' }));
    await expect(years[0]).toHaveTextContent('2022');
    // A partially entered date stays in the control, without being sent as a malformed value.
    await expect(
      canvas.getByRole('status', { name: 'Saved dates' }),
    ).toHaveTextContent('');
    await userEvent.click(months[0]);
    await userEvent.click(page.getByRole('option', { name: '03' }));
    await userEvent.click(years[1]);
    await userEvent.click(page.getByRole('option', { name: '2024' }));
    await expect(years[1]).toHaveTextContent('2024');
    await userEvent.click(months[1]);
    await userEvent.click(page.getByRole('option', { name: '06' }));
    await expect(
      canvas.getByRole('status', { name: 'Saved dates' }),
    ).toHaveTextContent('2022.03 - 2024.06');
    await userEvent.click(canvas.getByRole('checkbox'));
    await expect(years[1]).toBeDisabled();
    await expect(
      canvas.getByRole('status', { name: 'Saved dates' }),
    ).toHaveTextContent('2022.03 - Present');
    await userEvent.click(canvas.getByRole('checkbox'));
    await expect(
      canvas.getByRole('status', { name: 'Saved dates' }),
    ).toHaveTextContent('2022.03 - 2024.06');
    await userEvent.click(
      canvas.getByRole('button', { name: 'Load stored dates' }),
    );
    await expect(years[0]).toHaveTextContent('2019');
    await userEvent.click(canvas.getByRole('button', { name: 'Clear dates' }));
    await expect(years[0]).toHaveTextContent('aiLab.widgets.field.year');
  },
};
