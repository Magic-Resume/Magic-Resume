import type { Meta, StoryObj } from '@storybook/react-vite';
import AgentProgress from '../src/components/AgentProgress';

const meta = {
  title: 'Agent / AgentProgress',
  component: AgentProgress,
  parameters: { layout: 'centered' },
  argTypes: {
    steps: { control: 'object' },
  },
} satisfies Meta<typeof AgentProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {
  args: {
    steps: [
      { key: 'read', label: 'Read resume', status: 'completed' },
      {
        key: 'review',
        label: 'Review experience',
        status: 'in_progress',
        progress: 0.55,
      },
      { key: 'score', label: 'Score the match', status: 'pending' },
      { key: 'summary', label: 'Prepare recommendations', status: 'pending' },
    ],
  },
};

export const AllStepsCompleted: Story = {
  args: {
    steps: [
      { key: 'read', label: 'Read resume', status: 'completed' },
      { key: 'review', label: 'Review experience', status: 'completed' },
      { key: 'score', label: 'Score the match', status: 'completed' },
    ],
  },
};

export const LongLabels: Story = {
  args: {
    steps: [
      {
        key: 'one',
        label: 'Read the latest resume and portfolio files',
        status: 'completed',
      },
      {
        key: 'two',
        label: 'Compare the work history with the target job description',
        status: 'in_progress',
        progress: 0.35,
      },
      {
        key: 'three',
        label: 'Prepare a concise recommendation summary',
        status: 'pending',
      },
    ],
  },
};
