/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { template as attendanceStatusParent } from './attendance-status-parent.tsx'
import { template as attendanceAbsentCutoffParent } from './attendance-absent-cutoff-parent.tsx'
import { template as contactFormMessage } from './contact-form-message.tsx'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'attendance-status-parent': attendanceStatusParent,
  'attendance-absent-cutoff-parent': attendanceAbsentCutoffParent,
  'contact-form-message': contactFormMessage,
}
