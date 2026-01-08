import { Preview } from '@react-email/components';

type EmailPreviewProps = {
  text: string;
};

export function EmailPreview({ text }: EmailPreviewProps) {
  return <Preview>{text}</Preview>;
}

export default EmailPreview;
