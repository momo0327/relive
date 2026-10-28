import type { ReportReason } from '@/lib/types';
import { showActions } from '@/ui/action-sheet';

const reasons: [ReportReason, string][] = [
  ['inappropriate', 'Nudity or sexual content'],
  ['harassment', 'Harassment or bullying'],
  ['privacy', 'Shared without consent'],
  ['spam', 'Spam'],
  ['other', 'Something else'],
];

export function chooseReportReason(onChoose: (reason: ReportReason) => void) {
  showActions(
    'Why are you reporting this?',
    reasons.map(([reason, text]) => ({ text, onPress: () => onChoose(reason) })),
    'Reports are confidential. The person won’t be told who reported them.',
  );
}
