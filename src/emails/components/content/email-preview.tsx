import { Preview } from '@react-email/preview';

type EmailPreviewProps = {
  text: string;
};

export function EmailPreview({ text }: EmailPreviewProps) {
  return <Preview>{text}</Preview>;
}

export default EmailPreview;
