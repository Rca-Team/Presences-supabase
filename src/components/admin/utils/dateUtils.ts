
import { isWorkingDayForSchool } from '@/utils/workingDays';

// Function to check if a date exists in an array of dates
export const isDateInArray = (date: Date, dateArray: Date[]): boolean => {
  return dateArray.some(d => 
    d.getFullYear() === date.getFullYear() &&
    d.getMonth() === date.getMonth() &&
    d.getDate() === date.getDate()
  );
};

// Generate working days for a specific month
export const generateWorkingDays = (year: number, month: number): Date[] => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const days: Date[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    if (isWorkingDayForSchool(date)) {
      days.push(date);
    }
  }
  
  return days;
};
