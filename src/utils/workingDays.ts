export const isSecondSaturday = (date: Date): boolean => {
  if (date.getDay() !== 6) return false;
  const dayOfMonth = date.getDate();
  return dayOfMonth >= 8 && dayOfMonth <= 14;
};

export const isWorkingDayForSchool = (date: Date): boolean => {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return false; // Sunday
  if (dayOfWeek === 6) return !isSecondSaturday(date); // Saturday except 2nd Saturday
  return true; // Monday-Friday
};

export const filterWorkingDaysForSchool = (dates: Date[]): Date[] => {
  return dates.filter(isWorkingDayForSchool);
};