import { toast } from 'sonner';

export interface AlertRule {
  id: string;
  name: string;
  type: 'attendance' | 'security' | 'quality' | 'behavior';
  conditions: AlertCondition[];
  actions: AlertAction[];
  enabled: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface AlertCondition {
  type: 'time' | 'recognition' | 'quality' | 'expression' | 'multiple_faces' | 'liveness';
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'between';
  value: any;
  threshold?: number;
}

export interface AlertAction {
  type: 'toast' | 'log' | 'email' | 'sound' | 'highlight';
  message: string;
  data?: any;
}

export interface AttendanceEvent {
  userId?: string;
  userName?: string;
  timestamp: Date;
  status: 'present' | 'late' | 'unauthorized';
  confidence?: number;
  faceAnalysis?: any;
  imageUrl?: string;
}

// Default alert rules
const defaultRules: AlertRule[] = [
  {
    id: 'late_arrival',
    name: 'Late Arrival Alert',
    type: 'attendance',
    conditions: [
      { type: 'recognition', operator: 'equals', value: true },
      { type: 'time', operator: 'greater_than', value: '09:00' }
    ],
    actions: [
      { type: 'toast', message: '⏰ {userName} arrived late at {time}' },
      { type: 'log', message: 'Late arrival recorded for {userName}' }
    ],
    enabled: true,
    priority: 'medium'
  },
  {
    id: 'unauthorized_access',
    name: 'Unauthorized Access Alert',
    type: 'security',
    conditions: [
      { type: 'recognition', operator: 'equals', value: false }
    ],
    actions: [
      { type: 'toast', message: '🚨 Unauthorized person detected!' },
      { type: 'log', message: 'Unauthorized access attempt recorded' },
      { type: 'highlight', message: 'Security alert triggered' }
    ],
    enabled: true,
    priority: 'high'
  },
  {
    id: 'poor_image_quality',
    name: 'Poor Image Quality Alert',
    type: 'quality',
    conditions: [
      { type: 'quality', operator: 'less_than', value: 0.5, threshold: 0.5 }
    ],
    actions: [
      { type: 'toast', message: '📷 Poor image quality detected. Please improve lighting or camera position.' }
    ],
    enabled: true,
    priority: 'low'
  },
  {
    id: 'multiple_faces',
    name: 'Multiple Faces Alert',
    type: 'behavior',
    conditions: [
      { type: 'multiple_faces', operator: 'greater_than', value: 1 }
    ],
    actions: [
      { type: 'toast', message: '👥 Multiple faces detected. Please ensure only one person is in frame.' }
    ],
    enabled: true,
    priority: 'medium'
  },
  {
    id: 'liveness_failed',
    name: 'Liveness Check Failed',
    type: 'security',
    conditions: [
      { type: 'liveness', operator: 'equals', value: false }
    ],
    actions: [
      { type: 'toast', message: '🤖 Liveness check failed. Please show natural movement.' },
      { type: 'log', message: 'Potential spoofing attempt detected' }
    ],
    enabled: true,
    priority: 'high'
  },
  {
    id: 'happy_mood',
    name: 'Happy Employee Alert',
    type: 'behavior',
    conditions: [
      { type: 'expression', operator: 'greater_than', value: 0.7, threshold: 0.7 }
    ],
    actions: [
      { type: 'toast', message: '😊 {userName} is having a great day!' }
    ],
    enabled: false,
    priority: 'low'
  }
];

class SmartAlertsService {
  private rules: AlertRule[] = defaultRules;
  private alertHistory: Array<{ rule: AlertRule; event: AttendanceEvent; timestamp: Date }> = [];

  // Evaluate all rules against an attendance event
  evaluateEvent(event: AttendanceEvent): void {
    const triggeredRules = this.rules.filter(rule => 
      rule.enabled && this.evaluateRule(rule, event)
    );

    // Sort by priority (critical > high > medium > low)
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    triggeredRules.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);

    // Execute actions for triggered rules
    triggeredRules.forEach(rule => {
      this.executeRuleActions(rule, event);
      this.alertHistory.push({
        rule,
        event,
        timestamp: new Date()
      });
    });
  }

  // Evaluate a single rule against an event
  private evaluateRule(rule: AlertRule, event: AttendanceEvent): boolean {
    return rule.conditions.every(condition => this.evaluateCondition(condition, event));
  }

  // Evaluate a single condition
  private evaluateCondition(condition: AlertCondition, event: AttendanceEvent): boolean {
    switch (condition.type) {
      case 'time':
        return this.evaluateTimeCondition(condition, event.timestamp);
      
      case 'recognition':
        const isRecognized = event.status !== 'unauthorized';
        return this.compareValues(isRecognized, condition.operator, condition.value);
      
      case 'quality':
        const qualityScore = event.faceAnalysis?.quality?.score || 0;
        return this.compareValues(qualityScore, condition.operator, condition.value);
      
      case 'expression':
        const expressions = event.faceAnalysis?.expressions;
        if (!expressions) return false;
        const happyScore = expressions.happy || 0;
        return this.compareValues(happyScore, condition.operator, condition.value);
      
      case 'multiple_faces':
        const faceCount = event.faceAnalysis?.faceCount || 1;
        return this.compareValues(faceCount, condition.operator, condition.value);
      
      case 'liveness':
        const isLive = event.faceAnalysis?.liveness?.isLive || true;
        return this.compareValues(isLive, condition.operator, condition.value);
      
      default:
        return false;
    }
  }

  // Evaluate time-based conditions
  private evaluateTimeCondition(condition: AlertCondition, timestamp: Date): boolean {
    const time = timestamp.toTimeString().slice(0, 5); // HH:MM format
    return this.compareValues(time, condition.operator, condition.value);
  }

  // Generic value comparison
  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      
      case 'greater_than':
        if (typeof actual === 'string' && typeof expected === 'string') {
          return actual > expected; // String comparison for time
        }
        return Number(actual) > Number(expected);
      
      case 'less_than':
        if (typeof actual === 'string' && typeof expected === 'string') {
          return actual < expected;
        }
        return Number(actual) < Number(expected);
      
      case 'contains':
        return String(actual).toLowerCase().includes(String(expected).toLowerCase());
      
      case 'between':
        const [min, max] = expected;
        const value = Number(actual);
        return value >= min && value <= max;
      
      default:
        return false;
    }
  }

  // Execute actions for a triggered rule
  private executeRuleActions(rule: AlertRule, event: AttendanceEvent): void {
    rule.actions.forEach(action => {
      const message = this.formatMessage(action.message, event);
      
      switch (action.type) {
        case 'toast':
          this.showToast(message, rule.priority);
          break;
        
        case 'log':
          console.log(`[${rule.priority.toUpperCase()}] ${message}`, { rule, event });
          break;
        
        case 'highlight':
          // Could trigger UI highlighting
          console.info(`HIGHLIGHT: ${message}`);
          break;
        
        case 'sound':
          this.playAlertSound(rule.priority);
          break;
        
        case 'email':
          // Would integrate with email service
          console.log(`EMAIL ALERT: ${message}`);
          break;
      }
    });
  }

  // Format message with event data
  private formatMessage(template: string, event: AttendanceEvent): string {
    return template
      .replace('{userName}', event.userName || 'Unknown User')
      .replace('{time}', event.timestamp.toLocaleTimeString())
      .replace('{status}', event.status)
      .replace('{confidence}', (event.confidence || 0).toFixed(2));
  }

  // Show toast notification based on priority
  private showToast(message: string, priority: string): void {
    switch (priority) {
      case 'critical':
      case 'high':
        toast.error(message, { duration: 8000 });
        break;
      
      case 'medium':
        toast.warning(message, { duration: 5000 });
        break;
      
      case 'low':
      default:
        toast.info(message, { duration: 3000 });
        break;
    }
  }

  // Play alert sound (if browser supports it)
  private playAlertSound(priority: string): void {
    try {
      // Create different tones for different priorities
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      // Set frequency based on priority
      const frequencies = { critical: 800, high: 600, medium: 400, low: 300 };
      oscillator.frequency.setValueAtTime(frequencies[priority as keyof typeof frequencies] || 400, audioContext.currentTime);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.warn('Could not play alert sound:', error);
    }
  }

  // Rule management methods
  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  updateRule(ruleId: string, updates: Partial<AlertRule>): void {
    const index = this.rules.findIndex(rule => rule.id === ruleId);
    if (index !== -1) {
      this.rules[index] = { ...this.rules[index], ...updates };
    }
  }

  deleteRule(ruleId: string): void {
    this.rules = this.rules.filter(rule => rule.id !== ruleId);
  }

  toggleRule(ruleId: string): void {
    const rule = this.rules.find(rule => rule.id === ruleId);
    if (rule) {
      rule.enabled = !rule.enabled;
    }
  }

  getRules(): AlertRule[] {
    return [...this.rules];
  }

  getAlertHistory(limit = 50): Array<{ rule: AlertRule; event: AttendanceEvent; timestamp: Date }> {
    return this.alertHistory
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  clearHistory(): void {
    this.alertHistory = [];
  }
}

// Export singleton instance
export const smartAlertsService = new SmartAlertsService();