export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_insights: {
        Row: {
          content: string | null
          created_at: string
          id: string
          insight_type: string | null
          metadata: Json | null
          score: number | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          insight_type?: string | null
          metadata?: Json | null
          score?: number | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          insight_type?: string | null
          metadata?: Json | null
          score?: number | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      attendance_points: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          points: number | null
          reason: string | null
          student_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          points?: number | null
          reason?: string | null
          student_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          points?: number | null
          reason?: string | null
          student_id?: string | null
        }
        Relationships: []
      }
      attendance_predictions: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          notification_sent: boolean | null
          probability: number | null
          risk_level: string | null
          student_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          notification_sent?: boolean | null
          probability?: number | null
          risk_level?: string | null
          student_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          notification_sent?: boolean | null
          probability?: number | null
          risk_level?: string | null
          student_id?: string | null
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          category: string | null
          class: string | null
          confidence: number | null
          confidence_score: number | null
          created_at: string
          date: string
          device_info: Json | null
          id: string
          image_url: string | null
          location: string | null
          metadata: Json | null
          method: string | null
          notes: string | null
          period_key: string | null
          section: string | null
          status: string | null
          subject: string | null
          timestamp: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          class?: string | null
          confidence?: number | null
          confidence_score?: number | null
          created_at?: string
          date?: string
          device_info?: Json | null
          id?: string
          image_url?: string | null
          location?: string | null
          metadata?: Json | null
          method?: string | null
          notes?: string | null
          period_key?: string | null
          section?: string | null
          status?: string | null
          subject?: string | null
          timestamp?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          class?: string | null
          confidence?: number | null
          confidence_score?: number | null
          created_at?: string
          date?: string
          device_info?: Json | null
          id?: string
          image_url?: string | null
          location?: string | null
          metadata?: Json | null
          method?: string | null
          notes?: string | null
          period_key?: string | null
          section?: string | null
          status?: string | null
          subject?: string | null
          timestamp?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      attendance_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      badges: {
        Row: {
          created_at: string
          criteria: Json | null
          description: string | null
          icon: string | null
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          criteria?: Json | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          criteria?: Json | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      bus_events: {
        Row: {
          bus_id: string | null
          created_at: string
          event_type: string | null
          id: string
          location: string | null
          metadata: Json | null
        }
        Insert: {
          bus_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          location?: string | null
          metadata?: Json | null
        }
        Update: {
          bus_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          location?: string | null
          metadata?: Json | null
        }
        Relationships: []
      }
      buses: {
        Row: {
          bus_number: string | null
          capacity: number | null
          created_at: string
          driver_name: string | null
          driver_phone: string | null
          id: string
          metadata: Json | null
          route_name: string | null
        }
        Insert: {
          bus_number?: string | null
          capacity?: number | null
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          metadata?: Json | null
          route_name?: string | null
        }
        Update: {
          bus_number?: string | null
          capacity?: number | null
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          metadata?: Json | null
          route_name?: string | null
        }
        Relationships: []
      }
      campus_zones: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          name: string | null
          zone_type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string | null
          zone_type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string | null
          zone_type?: string | null
        }
        Relationships: []
      }
      circulars: {
        Row: {
          circular_type: string | null
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          is_urgent: boolean | null
          metadata: Json | null
          sent_at: string | null
          title: string | null
        }
        Insert: {
          circular_type?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_urgent?: boolean | null
          metadata?: Json | null
          sent_at?: string | null
          title?: string | null
        }
        Update: {
          circular_type?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_urgent?: boolean | null
          metadata?: Json | null
          sent_at?: string | null
          title?: string | null
        }
        Relationships: []
      }
      class_leaderboard: {
        Row: {
          class: string | null
          created_at: string
          id: string
          metadata: Json | null
          month_year: string | null
          section: string | null
          total_points: number | null
          updated_at: string
        }
        Insert: {
          class?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          month_year?: string | null
          section?: string | null
          total_points?: number | null
          updated_at?: string
        }
        Update: {
          class?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          month_year?: string | null
          section?: string | null
          total_points?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      class_teachers: {
        Row: {
          category: string | null
          class: string | null
          created_at: string
          id: string
          metadata: Json | null
          role: string | null
          section: string | null
          teacher_email: string | null
          teacher_id: string | null
          teacher_name: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          class?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string | null
          section?: string | null
          teacher_email?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          class?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string | null
          section?: string | null
          teacher_email?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      emergency_events: {
        Row: {
          created_at: string
          description: string | null
          event_type: string | null
          id: string
          metadata: Json | null
          severity: string | null
          status: string | null
          title: string | null
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_type?: string | null
          id?: string
          metadata?: Json | null
          severity?: string | null
          status?: string | null
          title?: string | null
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_type?: string | null
          id?: string
          metadata?: Json | null
          severity?: string | null
          status?: string | null
          title?: string | null
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      emotion_events: {
        Row: {
          confidence: number | null
          created_at: string
          emotion: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          emotion?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          emotion?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      face_descriptors: {
        Row: {
          category: string | null
          class: string | null
          created_at: string
          descriptor: Json | null
          descriptors: Json | null
          id: string
          image_url: string | null
          label: string | null
          metadata: Json | null
          quality: number | null
          section: string | null
          student_id: string | null
          student_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          class?: string | null
          created_at?: string
          descriptor?: Json | null
          descriptors?: Json | null
          id?: string
          image_url?: string | null
          label?: string | null
          metadata?: Json | null
          quality?: number | null
          section?: string | null
          student_id?: string | null
          student_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          class?: string | null
          created_at?: string
          descriptor?: Json | null
          descriptors?: Json | null
          id?: string
          image_url?: string | null
          label?: string | null
          metadata?: Json | null
          quality?: number | null
          section?: string | null
          student_id?: string | null
          student_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      gate_entries: {
        Row: {
          class: string | null
          confidence_score: number | null
          created_at: string
          entry_time: string
          gate_name: string | null
          gate_session_id: string | null
          id: string
          is_recognized: boolean | null
          metadata: Json | null
          section: string | null
          snapshot_url: string | null
          student_id: string | null
          student_name: string | null
        }
        Insert: {
          class?: string | null
          confidence_score?: number | null
          created_at?: string
          entry_time?: string
          gate_name?: string | null
          gate_session_id?: string | null
          id?: string
          is_recognized?: boolean | null
          metadata?: Json | null
          section?: string | null
          snapshot_url?: string | null
          student_id?: string | null
          student_name?: string | null
        }
        Update: {
          class?: string | null
          confidence_score?: number | null
          created_at?: string
          entry_time?: string
          gate_name?: string | null
          gate_session_id?: string | null
          id?: string
          is_recognized?: boolean | null
          metadata?: Json | null
          section?: string | null
          snapshot_url?: string | null
          student_id?: string | null
          student_name?: string | null
        }
        Relationships: []
      }
      gate_sessions: {
        Row: {
          created_at: string
          device_info: Json | null
          ended_at: string | null
          gate_name: string | null
          id: string
          metadata: Json | null
          started_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          ended_at?: string | null
          gate_name?: string | null
          id?: string
          metadata?: Json | null
          started_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          ended_at?: string | null
          gate_name?: string | null
          id?: string
          metadata?: Json | null
          started_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      gv_camera_zones: {
        Row: {
          camera_id: string
          created_at: string
          id: string
          polygon: Json
          zone_key: string
        }
        Insert: {
          camera_id: string
          created_at?: string
          id?: string
          polygon?: Json
          zone_key: string
        }
        Update: {
          camera_id?: string
          created_at?: string
          id?: string
          polygon?: Json
          zone_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "gv_camera_zones_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "gv_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
      gv_cameras: {
        Row: {
          bridge_token_hash: string | null
          class_key: string | null
          created_at: string
          id: string
          last_seen_at: string | null
          location_kind: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          bridge_token_hash?: string | null
          class_key?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          location_kind?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          bridge_token_hash?: string | null
          class_key?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          location_kind?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      gv_class_sessions: {
        Row: {
          class_key: string
          created_at: string
          day_key: string
          id: string
          meta: Json | null
          period_key: string
          student_count_peak: number
          students_left_after: number
          students_left_during: number
          teacher_confirmed: boolean
          teacher_entered_at: string | null
          teacher_exited_at: string | null
          teacher_scheduled: string | null
          updated_at: string
        }
        Insert: {
          class_key: string
          created_at?: string
          day_key?: string
          id?: string
          meta?: Json | null
          period_key: string
          student_count_peak?: number
          students_left_after?: number
          students_left_during?: number
          teacher_confirmed?: boolean
          teacher_entered_at?: string | null
          teacher_exited_at?: string | null
          teacher_scheduled?: string | null
          updated_at?: string
        }
        Update: {
          class_key?: string
          created_at?: string
          day_key?: string
          id?: string
          meta?: Json | null
          period_key?: string
          student_count_peak?: number
          students_left_after?: number
          students_left_during?: number
          teacher_confirmed?: boolean
          teacher_entered_at?: string | null
          teacher_exited_at?: string | null
          teacher_scheduled?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      gv_events: {
        Row: {
          camera_id: string
          class_key: string | null
          event_type: string
          id: string
          meta: Json | null
          occurred_at: string
          period_key: string | null
          subject_id: string | null
          subject_name: string | null
          subject_type: string
          track_id: string | null
          zone: string | null
        }
        Insert: {
          camera_id: string
          class_key?: string | null
          event_type: string
          id?: string
          meta?: Json | null
          occurred_at?: string
          period_key?: string | null
          subject_id?: string | null
          subject_name?: string | null
          subject_type?: string
          track_id?: string | null
          zone?: string | null
        }
        Update: {
          camera_id?: string
          class_key?: string | null
          event_type?: string
          id?: string
          meta?: Json | null
          occurred_at?: string
          period_key?: string | null
          subject_id?: string | null
          subject_name?: string | null
          subject_type?: string
          track_id?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gv_events_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "gv_cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gv_events_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "gv_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      gv_tracks: {
        Row: {
          appearance_sig: Json | null
          camera_id: string
          confidence: number | null
          day_key: string
          ended_at: string | null
          id: string
          last_zone: string | null
          local_track_id: string
          started_at: string
          subject_id: string | null
          subject_name: string | null
          subject_type: string
        }
        Insert: {
          appearance_sig?: Json | null
          camera_id: string
          confidence?: number | null
          day_key?: string
          ended_at?: string | null
          id?: string
          last_zone?: string | null
          local_track_id: string
          started_at?: string
          subject_id?: string | null
          subject_name?: string | null
          subject_type?: string
        }
        Update: {
          appearance_sig?: Json | null
          camera_id?: string
          confidence?: number | null
          day_key?: string
          ended_at?: string | null
          id?: string
          last_zone?: string | null
          local_track_id?: string
          started_at?: string
          subject_id?: string | null
          subject_name?: string | null
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gv_tracks_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "gv_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
      late_entries: {
        Row: {
          created_at: string
          entry_time: string
          id: string
          metadata: Json | null
          reason: string | null
          reason_detail: string | null
          student_id: string | null
          student_name: string | null
        }
        Insert: {
          created_at?: string
          entry_time?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          reason_detail?: string | null
          student_id?: string | null
          student_name?: string | null
        }
        Update: {
          created_at?: string
          entry_time?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          reason_detail?: string | null
          student_id?: string | null
          student_name?: string | null
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          channel: string | null
          created_at: string
          id: string
          message: string | null
          metadata: Json | null
          recipient: string | null
          status: string | null
          subject: string | null
          user_id: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          recipient?: string | null
          status?: string | null
          subject?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          recipient?: string | null
          status?: string | null
          subject?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string | null
          metadata: Json | null
          title: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      period_timings: {
        Row: {
          category: string | null
          created_at: string
          end_time: string | null
          id: string
          metadata: Json | null
          period_key: string | null
          period_name: string | null
          period_number: number | null
          start_time: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          metadata?: Json | null
          period_key?: string | null
          period_name?: string | null
          period_number?: number | null
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          metadata?: Json | null
          period_key?: string | null
          period_name?: string | null
          period_number?: number | null
          start_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          admission_number: string | null
          avatar_url: string | null
          blood_group: string | null
          bus_route: string | null
          category: string | null
          class: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          employee_id: string | null
          father_name: string | null
          full_name: string | null
          gender: string | null
          house: string | null
          id: string
          metadata: Json | null
          mother_name: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          phone: string | null
          photo_url: string | null
          role: string | null
          roll_number: string | null
          section: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          admission_number?: string | null
          avatar_url?: string | null
          blood_group?: string | null
          bus_route?: string | null
          category?: string | null
          class?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          employee_id?: string | null
          father_name?: string | null
          full_name?: string | null
          gender?: string | null
          house?: string | null
          id?: string
          metadata?: Json | null
          mother_name?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          photo_url?: string | null
          role?: string | null
          roll_number?: string | null
          section?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          admission_number?: string | null
          avatar_url?: string | null
          blood_group?: string | null
          bus_route?: string | null
          category?: string | null
          class?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          employee_id?: string | null
          father_name?: string | null
          full_name?: string | null
          gender?: string | null
          house?: string | null
          id?: string
          metadata?: Json | null
          mother_name?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          photo_url?: string | null
          role?: string | null
          roll_number?: string | null
          section?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      school_gates: {
        Row: {
          created_at: string
          detection_box: Json | null
          gate_type: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          detection_box?: Json | null
          gate_type?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          detection_box?: Json | null
          gate_type?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      school_holidays: {
        Row: {
          created_at: string
          holiday_date: string | null
          holiday_type: string | null
          id: string
          metadata: Json | null
          name: string | null
          name_hindi: string | null
        }
        Insert: {
          created_at?: string
          holiday_date?: string | null
          holiday_type?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          name_hindi?: string | null
        }
        Update: {
          created_at?: string
          holiday_date?: string | null
          holiday_type?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          name_hindi?: string | null
        }
        Relationships: []
      }
      student_badges: {
        Row: {
          badge_id: string | null
          created_at: string
          id: string
          month_year: string | null
          student_id: string | null
        }
        Insert: {
          badge_id?: string | null
          created_at?: string
          id?: string
          month_year?: string | null
          student_id?: string | null
        }
        Update: {
          badge_id?: string | null
          created_at?: string
          id?: string
          month_year?: string | null
          student_id?: string | null
        }
        Relationships: []
      }
      subjects: {
        Row: {
          category: string | null
          class: string | null
          color: string | null
          created_at: string
          id: string
          metadata: Json | null
          name: string
          section: string | null
          short_name: string | null
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          class?: string | null
          color?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          section?: string | null
          short_name?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          class?: string | null
          color?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          section?: string | null
          short_name?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      substitutions: {
        Row: {
          class: string | null
          created_at: string
          date: string | null
          id: string
          metadata: Json | null
          original_teacher_id: string | null
          period_key: string | null
          reason: string | null
          section: string | null
          status: string | null
          subject: string | null
          substitute_teacher_id: string | null
          updated_at: string
        }
        Insert: {
          class?: string | null
          created_at?: string
          date?: string | null
          id?: string
          metadata?: Json | null
          original_teacher_id?: string | null
          period_key?: string | null
          reason?: string | null
          section?: string | null
          status?: string | null
          subject?: string | null
          substitute_teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          class?: string | null
          created_at?: string
          date?: string | null
          id?: string
          metadata?: Json | null
          original_teacher_id?: string | null
          period_key?: string | null
          reason?: string | null
          section?: string | null
          status?: string | null
          subject?: string | null
          substitute_teacher_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      teacher_permissions: {
        Row: {
          can_edit_timetable: boolean | null
          can_export_reports: boolean | null
          can_take_attendance: boolean | null
          category: string | null
          class: string | null
          created_at: string
          id: string
          metadata: Json | null
          section: string | null
          teacher_id: string | null
          user_id: string | null
        }
        Insert: {
          can_edit_timetable?: boolean | null
          can_export_reports?: boolean | null
          can_take_attendance?: boolean | null
          category?: string | null
          class?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          section?: string | null
          teacher_id?: string | null
          user_id?: string | null
        }
        Update: {
          can_edit_timetable?: boolean | null
          can_export_reports?: boolean | null
          can_take_attendance?: boolean | null
          category?: string | null
          class?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          section?: string | null
          teacher_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      timetable: {
        Row: {
          category: string | null
          class: string | null
          created_at: string
          day_key: string | null
          day_of_week: string | null
          end_time: string | null
          id: string
          metadata: Json | null
          period_key: string | null
          period_number: number | null
          room: string | null
          section: string | null
          start_time: string | null
          subject: string | null
          subject_id: string | null
          teacher_id: string | null
          teacher_name: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          class?: string | null
          created_at?: string
          day_key?: string | null
          day_of_week?: string | null
          end_time?: string | null
          id?: string
          metadata?: Json | null
          period_key?: string | null
          period_number?: number | null
          room?: string | null
          section?: string | null
          start_time?: string | null
          subject?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          class?: string | null
          created_at?: string
          day_key?: string | null
          day_of_week?: string | null
          end_time?: string | null
          id?: string
          metadata?: Json | null
          period_key?: string | null
          period_number?: number | null
          room?: string | null
          section?: string | null
          start_time?: string | null
          subject?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitors: {
        Row: {
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          host_name: string | null
          id: string
          metadata: Json | null
          name: string | null
          phone: string | null
          photo_url: string | null
          purpose: string | null
        }
        Insert: {
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          host_name?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          phone?: string | null
          photo_url?: string | null
          purpose?: string | null
        }
        Update: {
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          host_name?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          phone?: string | null
          photo_url?: string | null
          purpose?: string | null
        }
        Relationships: []
      }
      wellness_scores: {
        Row: {
          created_at: string
          factors: Json | null
          id: string
          metadata: Json | null
          score: number | null
          student_id: string | null
        }
        Insert: {
          created_at?: string
          factors?: Json | null
          id?: string
          metadata?: Json | null
          score?: number | null
          student_id?: string | null
        }
        Update: {
          created_at?: string
          factors?: Json | null
          id?: string
          metadata?: Json | null
          score?: number | null
          student_id?: string | null
        }
        Relationships: []
      }
      zone_entries: {
        Row: {
          created_at: string
          entry_type: string | null
          id: string
          metadata: Json | null
          user_id: string | null
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          entry_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          entry_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
          zone_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "principal" | "teacher" | "user" | "staff" | "parent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "principal", "teacher", "user", "staff", "parent"],
    },
  },
} as const
