import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface ContactFormMessageProps {
  name?: string
  email?: string
  subject?: string
  message?: string
  submittedAt?: string
}

const ContactFormMessageEmail = ({
  name,
  email,
  subject,
  message,
  submittedAt,
}: ContactFormMessageProps) => {
  const shownTime = submittedAt || new Date().toLocaleString('en-IN')
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`New contact message from ${name || 'visitor'}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>📬 New Contact Form Message</Heading>
          <Section style={infoCard}>
            <Text style={infoLine}><strong>Name:</strong> {name || '-'}</Text>
            <Text style={infoLine}><strong>Email:</strong> {email || '-'}</Text>
            <Text style={infoLine}><strong>Subject:</strong> {subject || '-'}</Text>
            <Text style={infoLine}><strong>Submitted:</strong> {shownTime}</Text>
          </Section>
          <Heading as="h2" style={h2}>Message</Heading>
          <Section style={messageCard}>
            <Text style={messageText}>{message || ''}</Text>
          </Section>
          <Text style={muted}>Sent from the Presence website contact form.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ContactFormMessageEmail,
  to: 'rcaatl2022@gmail.com',
  subject: (data: Record<string, any>) =>
    `[Contact] ${data.subject || 'New message'} — ${data.name || 'Visitor'}`,
  displayName: 'Contact form message',
  previewData: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    subject: 'Question about Presence',
    message: 'Hi, I would like to know more about your service.',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: '0',
  padding: '24px',
}
const container = {
  border: '1px solid #2a3558',
  borderRadius: '18px',
  padding: '24px',
  backgroundColor: '#0f1426',
  boxShadow: '0 22px 46px -28px rgba(15, 20, 38, 0.85)',
}
const h1 = { margin: '0 0 16px', color: '#f8fbff', fontSize: '22px' }
const h2 = { margin: '14px 0 8px', color: '#f8fbff', fontSize: '16px' }
const infoCard = {
  border: '1px solid #2f3a63',
  borderRadius: '10px',
  backgroundColor: '#111a33',
  padding: '12px 14px',
  marginBottom: '14px',
}
const infoLine = { color: '#c7d2f0', fontSize: '13px', lineHeight: '20px', margin: '0 0 6px' }
const messageCard = {
  border: '1px solid #2f3a63',
  borderRadius: '10px',
  padding: '12px 14px',
  backgroundColor: '#111a33',
  marginBottom: '14px',
}
const messageText = { color: '#c7d2f0', fontSize: '14px', lineHeight: '22px', margin: '0', whiteSpace: 'pre-wrap' as const }
const muted = { color: '#8f9bc2', fontSize: '12px', lineHeight: '18px', margin: '14px 0 0' }