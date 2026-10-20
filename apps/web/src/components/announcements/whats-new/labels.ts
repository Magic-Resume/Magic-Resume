export type WhatsNewLabels = {
  open: string; dismiss: string; close: string; back: string; next: string; done: string;
  feature: string; improvement: string; highlights: string; slides: string;
  goTo: (index: number, title: string) => string;
  position: (index: number, total: number) => string;
};
export const defaultLabels: WhatsNewLabels = {
  open: "See what's new", dismiss: 'Dismiss release announcement', close: 'Close release notes',
  back: 'Back', next: 'Next', done: 'Got it', feature: 'New feature', improvement: 'Improvement',
  highlights: 'Highlights', slides: 'Release slides',
  goTo: (index, title) => `Go to slide ${index}: ${title}`, position: (index, total) => `Slide ${index} of ${total}`,
};
