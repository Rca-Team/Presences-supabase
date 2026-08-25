
import { Dispatch, SetStateAction } from 'react';

export interface FaceInfo {
  recordId: string; // The actual database record ID
  user_id?: string;
  name: string;
  class?: string;
  section?: string;
  employee_id: string;
  admission_number?: string;
  department: string;
  position: string;
  image_url?: string;
  roll_number?: string;
  blood_group?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  transport_mode?: string;
  address?: string;
}

export interface AttendanceRecord {
  id: string;
  timestamp: string;
  status: string;
  name?: string;
  image_url?: string;
  source?: string;
  capture_mode?: string;
  period_key?: string;
  class_name?: string;
  section?: string;
  subject?: string;
}

export type SetDatesFunction = Dispatch<SetStateAction<Date[]>>;
