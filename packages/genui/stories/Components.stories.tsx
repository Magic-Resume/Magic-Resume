import type { Meta, StoryObj } from '@storybook/react-vite';
import ApprovalCard from '../src/components/ApprovalCard';
import CodeBlock from '../src/components/CodeBlock';
import ContextCards from '../src/components/ContextCards';
import RecommendationCard from '../src/components/RecommendationCard';
import RecordsTable from '../src/components/RecordsTable';
import SidebarNav from '../src/components/SidebarNav';
import ToolChips from '../src/components/ToolChips';
import ChoiceCard from '../src/widgets/ChoiceCard';
import FormCard from '../src/widgets/FormCard';

const meta = {
  title: 'Agent / Components',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const CodeBlockStates: Story = {
  render: () => (
    <div className="flex w-[min(680px,calc(100vw-48px))] flex-col gap-4">
      <CodeBlock
        lang="typescript"
        filename="agent-progress.ts"
        code={
          "export function isComplete(status: string) {\n  return status === 'completed';\n}"
        }
      />
      <CodeBlock
        lang="json"
        filename="ui_widget.json"
        code={
          '{\n  "type": "ui_widget",\n  "payload": { "kind": "agent_progress" }\n}'
        }
      />
    </div>
  ),
};

export const ToolActivity: Story = {
  render: () => (
    <ToolChips
      title="2 tool calls"
      working
      rows={[
        {
          id: 'read',
          icon: 'read',
          label: 'Read',
          chip: 'resume.json',
          detail: [{ text: '3 sections' }],
        },
        {
          id: 'search',
          icon: 'search',
          label: 'Search',
          chip: 'target role',
          detail: [{ text: '8 sources' }],
        },
      ]}
    />
  ),
};

export const Approval: Story = {
  render: () => (
    <ApprovalCard
      questions={[
        {
          q: 'May I read your resume?',
          type: 'radio',
          options: ['Allow once', 'Always allow'],
        },
        {
          q: 'May I apply the suggested edits?',
          type: 'radio',
          options: ['Apply edits', 'Review first'],
        },
      ]}
      labels={{
        previous: 'Previous',
        next: 'Next',
        send: 'Continue',
        goTo: 'Go to question {{n}}',
        freeText: 'Other',
        freeTextAria: 'Other answer',
      }}
      onAnswer={(page, answer) => console.log('approval answer', page, answer)}
    />
  ),
};

export const Recommendation: Story = {
  render: () => (
    <RecommendationCard
      message="Which role best matches your experience?"
      options={[
        {
          label: 'Frontend Engineer',
          why: 'Strongest overlap with your recent work',
          confidence: 'high',
        },
        {
          label: 'Product Engineer',
          why: 'Good fit for your cross-functional experience',
          confidence: 'medium',
        },
        { label: 'UI Engineer', confidence: 'low' },
      ]}
      recommended={0}
      labels={{
        alternatives: 'See alternatives',
        others: 'Other options',
        accept: 'Choose this role',
        accepted: 'Role selected',
        confidence: {
          high: 'High confidence',
          medium: 'Medium confidence',
          low: 'Low confidence',
          none: 'No confidence',
        },
      }}
      onAccept={(label) => console.log('recommendation', label)}
    />
  ),
};

export const Context: Story = {
  render: () => (
    <ContextCards
      chunks={[
        {
          title: 'Resume',
          chars: '64 characters',
          body: 'Frontend engineer with five years of product experience.',
          source: 'resume.json',
          badge: 'JSON',
          tone: 'bg-mr-accent',
        },
        {
          title: 'Job description',
          chars: '66 characters',
          body: 'The role values accessible, production-ready interfaces.',
          source: 'job-description.md',
          badge: 'MD',
          tone: 'bg-mr-success',
        },
      ]}
    />
  ),
};

export const Navigation: Story = {
  render: () => (
    <SidebarNav
      activeKey="resume"
      sections={[
        {
          key: 'workspace',
          label: 'Workspace',
          items: [
            { key: 'resume', label: 'Resume' },
            { key: 'history', label: 'History' },
          ],
        },
        {
          key: 'tools',
          label: 'Tools',
          items: [{ key: 'templates', label: 'Templates' }],
        },
      ]}
      onSelect={(key) => console.log('nav', key)}
    />
  ),
};

export const ChoiceWidget: Story = {
  render: () => (
    <ChoiceCard
      instance={{
        widgetId: 'choice',
        kind: 'ask_choice',
        status: 'pending',
        props: {
          message: 'Which section should I improve first?',
          options: [
            { value: 'experience', label: 'Experience' },
            { value: 'projects', label: 'Projects' },
            { value: 'skills', label: 'Skills' },
          ],
        },
      }}
      onAction={(action) => console.log('choice', action)}
    />
  ),
};

export const FormWidget: Story = {
  render: () => (
    <FormCard
      instance={{
        widgetId: 'form',
        kind: 'request_form',
        status: 'pending',
        props: {
          title: 'Tell me about the role',
          fields: [
            { id: 'role', label: 'Target role', kind: 'text' },
            { id: 'location', label: 'Location', kind: 'text', optional: true },
          ],
        },
      }}
      onAction={(action) => console.log('form', action)}
    />
  ),
};

export const Records: Story = {
  render: () => (
    <RecordsTable
      ariaLabel="Applications"
      columns={[
        { key: 'company', label: 'Company', meta: { type: 'Text' } },
        { key: 'status', label: 'Status', meta: { type: 'Single select' } },
      ]}
      rows={[
        { id: '1', cells: { company: 'Northstar', status: 'Interview' } },
        { id: '2', cells: { company: 'Acme', status: 'Applied' } },
      ]}
    />
  ),
};
