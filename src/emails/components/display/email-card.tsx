import { Section } from '@react-email/components';

export function EmailCard({ children }: { children: React.ReactNode }) {
  return (
    <Section className="bg-white rounded-lg p-6 border border-gray-200">
      {children}
    </Section>
  );
}

export default EmailCard;
