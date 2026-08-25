import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface AttendanceStatusParentProps {
  parentName?: string
  studentName?: string
  status?: 'present' | 'late' | 'absent'
  timestamp?: string
  imageUrl?: string
}

const statusMeta = (status?: string) => {
  if (status === 'late') return { label: 'Late', color: 'hsl(38 96% 30%)', bg: 'hsl(38 96% 92%)', emoji: '⏰' }
  if (status === 'absent') return { label: 'Absent', color: 'hsl(0 84% 38%)', bg: 'hsl(0 84% 93%)', emoji: '❌' }
  return { label: 'Present', color: 'hsl(152 76% 28%)', bg: 'hsl(152 76% 92%)', emoji: '✅' }
}

const LOGO_URL = 'https://presences.dev/logo.png'

const AttendanceStatusParentEmail = ({
  parentName,
  studentName,
  status,
  timestamp,
  imageUrl,
}: AttendanceStatusParentProps) => {
  const meta = statusMeta(status)
  const shownTime = timestamp || new Date().toLocaleString('en-IN')
  const shouldShowPhoto = (status === 'present' || status === 'late') && !!imageUrl

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${studentName || 'Student'} marked ${meta.label}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={topLine} />
          <Img src={LOGO_URL} alt="Presence Logo" width="140" height="40" style={logo} />
          <Heading style={h1}>Realtime Attendance Alert</Heading>
          <Text style={text}>Hello {parentName || 'Parent/Guardian'},</Text>

          <Section style={{ ...heroCard, borderColor: meta.color }}>
            <Text style={{ ...badge, color: meta.color, backgroundColor: meta.bg }}>{meta.emoji} {meta.label}</Text>
            <Text style={heroTitle}>{studentName || 'Your child'} attendance updated</Text>
            <Text style={heroSub}>Recorded at {shownTime}</Text>
          </Section>

          <Section style={infoCard}>
            <Text style={infoLabel}>Student</Text>
            <Text style={infoValue}>{studentName || 'Student'}</Text>
            <Section style={divider} />
            <Text style={infoLabel}>Current status</Text>
            <Text style={{ ...infoValue, color: meta.color }}>{meta.label}</Text>
            <Section style={divider} />
            <Text style={infoLabel}>Timestamp</Text>
            <Text style={infoValue}>{shownTime}</Text>
          </Section>

          {shouldShowPhoto && (
            <Section style={photoWrap}>
              <Text style={photoLabel}>Captured face image at marking time</Text>
              <Img src={imageUrl as string} alt={`${studentName || 'Student'} attendance capture`} style={photo} />
            </Section>
          )}

          <Text style={muted}>This update is generated instantly from your school gate and attendance system.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AttendanceStatusParentEmail,
  subject: (data: Record<string, any>) => {
    const n = data.studentName || 'Student'
    const s = statusMeta(data.status).label
    return `${n} marked ${s}`
  },
  displayName: 'Attendance status for parent',
  previewData: {
    parentName: 'Parent',
    studentName: 'Rahul Sharma',
    status: 'present',
    timestamp: '02/05/2026, 08:58 AM',
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

const topLine = {
  height: '4px',
  width: '100%',
  borderRadius: '999px',
  backgroundColor: 'hsl(212 100% 47%)',
  marginBottom: '16px',
}

const logo = {
  marginBottom: '14px',
}

const h1 = {
  margin: '0 0 16px',
  color: '#f8fbff',
  fontSize: '24px',
  letterSpacing: '0',
}

const text = {
  color: '#c7d2f0',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 12px',
}

const textStrong = {
  ...text,
  fontWeight: '600',
}

const muted = {
  color: '#8f9bc2',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '16px 0 0',
}

const heroCard = {
  border: '1px solid #2f3a63',
  borderRadius: '12px',
  padding: '14px 14px 12px',
  marginBottom: '14px',
  backgroundColor: '#161f3c',
}

const badge = {
  margin: '0 0 10px',
  fontSize: '12px',
  fontWeight: '700',
  display: 'inline-block',
  padding: '5px 10px',
  borderRadius: '999px',
}

const heroTitle = {
  margin: '0 0 4px',
  color: '#f8fbff',
  fontSize: '16px',
  fontWeight: '700',
}

const heroSub = {
  margin: '0',
  color: '#9fb0dd',
  fontSize: '12px',
}

const infoCard = {
  border: '1px solid #2f3a63',
  borderRadius: '10px',
  backgroundColor: '#111a33',
  padding: '12px 14px',
  marginBottom: '14px',
}

const infoLabel = {
  color: '#93a3cc',
  fontSize: '11px',
  fontWeight: '600',
  margin: '0 0 2px',
}

const infoValue = {
  color: '#f8fbff',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0',
}

const divider = {
  borderBottom: '1px solid #2a3558',
  margin: '10px 0',
}

const photoWrap = {
  marginBottom: '10px',
}

const photoLabel = {
  color: '#93a3cc',
  fontSize: '12px',
  margin: '0 0 8px',
}

const photo = {
  width: '100%',
  maxWidth: '320px',
  borderRadius: '10px',
  border: '1px solid hsl(220 15% 90%)',
  objectFit: 'cover' as const,
}
