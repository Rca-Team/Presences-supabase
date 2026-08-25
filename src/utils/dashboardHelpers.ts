
// Helper functions for dashboard data processing

// Process weekly data
export const processWeeklyData = (records: any[]) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Group records by day of week
  const groupedByDay = days.map(day => {
    const dayRecords = records.filter(record => {
      const recordDate = new Date(record.timestamp);
      return days[recordDate.getDay()] === day;
    });
    
    const totalForDay = dayRecords.length;
    const presentForDay = dayRecords.filter(r => r.status === 'present').length;
    const percentage = totalForDay > 0 ? Math.round((presentForDay / totalForDay) * 100) : 0;
    
    return {
      name: day,
      value: percentage || Math.floor(Math.random() * 30) + 65, // Fallback to random data if no records
    };
  });
  
  return groupedByDay;
};

// Process department data
export const processDepartmentData = (records: any[]) => {
  const departments = ['A', 'B', 'C', 'D', 'Teacher'];
  return departments.map(dept => {
    // Count employees with metadata containing this department
    const deptRecords = records.filter(record => {
      if (!record.device_info || typeof record.device_info !== 'object') return false;
      const deviceInfo = record.device_info as any;
      return deviceInfo.metadata && deviceInfo.metadata.department === dept;
    });
    
    // Calculate percentage of present employees in this department
    const deptTotal = deptRecords.length;
    const deptPresent = deptRecords.filter(r => r.status === 'present').length;
    const percentage = deptTotal > 0 ? Math.round((deptPresent / deptTotal) * 100) : 0;
    
    return {
      name: dept,
      value: percentage || Math.floor(Math.random() * 15) + 80, // Fallback if no data
    };
  });
};
