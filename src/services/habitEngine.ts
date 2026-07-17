import { Habit, HabitEntry, Weekday } from '../types';

// ============================================================================
// DATE UTILITIES
// ============================================================================

export function getLocalYYYYMMDD(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Noon (12:00:00) avoids DST transition shifting the day back/forward
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return getLocalYYYYMMDD(d);
}

export function getWeekdayName(dateStr: string): Weekday {
  const d = parseLocalDate(dateStr);
  const days: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[d.getDay()];
}

export function getWeekInterval(dateStr: string): { start: string; end: string } {
  const d = parseLocalDate(dateStr);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday, ...
  const daysToSubtract = day === 0 ? 6 : day - 1;
  
  const monday = new Date(d);
  monday.setDate(monday.getDate() - daysToSubtract);
  
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  
  return {
    start: getLocalYYYYMMDD(monday),
    end: getLocalYYYYMMDD(sunday)
  };
}

export function getWeeklyIntervals(startDate: string, today: string): string[] {
  const startWeek = getWeekInterval(startDate).start;
  const todayWeek = getWeekInterval(today).start;
  
  const intervals: string[] = [];
  let current = startWeek;
  while (current <= todayWeek) {
    intervals.push(current);
    current = addDays(current, 7);
  }
  return intervals;
}

// ============================================================================
// SCHEDULE ENGINE PURE FUNCTIONS
// ============================================================================

export function isHabitScheduledOnDate(habit: Habit, date: string): boolean {
  if (date < habit.startDate) {
    return false;
  }
  
  if (habit.archived && habit.archivedAt) {
    const archiveDate = habit.archivedAt.split('T')[0];
    if (date > archiveDate) {
      return false;
    }
  }

  const schedule = habit.schedule;
  if (schedule.type === 'daily') {
    return true;
  }
  if (schedule.type === 'weekdays') {
    const dayName = getWeekdayName(date);
    return dayName !== 'saturday' && dayName !== 'sunday';
  }
  if (schedule.type === 'selected_days') {
    const dayName = getWeekdayName(date);
    return schedule.selectedDays.includes(dayName);
  }
  if (schedule.type === 'weekly_target') {
    // weekly_target is not treated as due on one particular day
    return false;
  }
  return false;
}

export function calculateScheduledHabitStreak(
  habit: Habit, 
  entries: HabitEntry[], 
  today: string
): { currentStreak: number; longestStreak: number } {
  if (habit.schedule.type === 'weekly_target') {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Generate all scheduled dates from startDate to today (inclusive)
  const scheduledDates: string[] = [];
  let cur = habit.startDate;
  while (cur <= today) {
    if (isHabitScheduledOnDate(habit, cur)) {
      scheduledDates.push(cur);
    }
    cur = addDays(cur, 1);
  }

  // 1. Calculate currentStreak walking backwards
  let currentStreak = 0;
  for (let i = scheduledDates.length - 1; i >= 0; i--) {
    const date = scheduledDates[i];
    const isCompleted = entries.some(e => e.habitId === habit.id && e.date === date && e.completed);
    
    if (isCompleted) {
      currentStreak++;
    } else {
      if (date === today) {
        // Today being incomplete must not immediately erase the previous streak while today is still in progress.
        continue;
      } else {
        // The most recent missed scheduled date before today breaks the current streak.
        break;
      }
    }
  }

  // 2. Calculate longestStreak walking forward
  let longestStreak = 0;
  let tempStreak = 0;
  for (const date of scheduledDates) {
    const isCompleted = entries.some(e => e.habitId === habit.id && e.date === date && e.completed);
    if (isCompleted) {
      tempStreak++;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
    } else {
      tempStreak = 0;
    }
  }

  return { currentStreak, longestStreak };
}

export function calculateWeeklyTargetProgress(
  habit: Habit, 
  entries: HabitEntry[], 
  today: string
): { 
  currentWeekCompleted: number; 
  currentWeekTarget: number; 
  currentSuccessfulWeeks: number; 
  longestSuccessfulWeeks: number; 
} {
  if (habit.schedule.type !== 'weekly_target') {
    return {
      currentWeekCompleted: 0,
      currentWeekTarget: 0,
      currentSuccessfulWeeks: 0,
      longestSuccessfulWeeks: 0
    };
  }
  
  const weeklyTarget = habit.schedule.weeklyTarget;
  const { start: curWeekStart, end: curWeekEnd } = getWeekInterval(today);
  
  // Count completed entries in current week
  const currentWeekCompleted = entries.filter(e => 
    e.habitId === habit.id && 
    e.date >= curWeekStart && 
    e.date <= curWeekEnd && 
    e.completed
  ).length;
  
  // List all week start dates from habit.startDate to today
  const weekMondays = getWeeklyIntervals(habit.startDate, today);
  const successArray = weekMondays.map(monday => {
    const sunday = addDays(monday, 6);
    const completedCount = entries.filter(e => 
      e.habitId === habit.id && 
      e.date >= monday && 
      e.date <= sunday && 
      e.completed
    ).length;
    return completedCount >= weeklyTarget;
  });
  
  // Calculate currentSuccessfulWeeks walking backwards
  let currentSuccessfulWeeks = 0;
  const currentMonday = getWeekInterval(today).start;
  for (let i = weekMondays.length - 1; i >= 0; i--) {
    const monday = weekMondays[i];
    const success = successArray[i];
    
    if (success) {
      currentSuccessfulWeeks++;
    } else {
      if (monday === currentMonday) {
        // Do not count the current unfinished week as a failed week
        continue;
      } else {
        break;
      }
    }
  }
  
  // Calculate longestSuccessfulWeeks
  let longestSuccessfulWeeks = 0;
  let tempSuccess = 0;
  for (const success of successArray) {
    if (success) {
      tempSuccess++;
      if (tempSuccess > longestSuccessfulWeeks) {
        longestSuccessfulWeeks = tempSuccess;
      }
    } else {
      tempSuccess = 0;
    }
  }
  
  return {
    currentWeekCompleted,
    currentWeekTarget: weeklyTarget,
    currentSuccessfulWeeks,
    longestSuccessfulWeeks
  };
}

export function calculateCompletionRate(
  habit: Habit, 
  entries: HabitEntry[], 
  from: string, 
  to: string
): number {
  const startRange = from > habit.startDate ? from : habit.startDate;
  if (startRange > to) {
    return 0; // Return zero safely when no scheduled opportunities exist.
  }

  if (habit.schedule.type !== 'weekly_target') {
    let totalScheduled = 0;
    let completedScheduled = 0;
    let cur = startRange;
    while (cur <= to) {
      if (isHabitScheduledOnDate(habit, cur)) {
        totalScheduled++;
        if (entries.some(e => e.habitId === habit.id && e.date === cur && e.completed)) {
          completedScheduled++;
        }
      }
      cur = addDays(cur, 1);
    }
    
    if (totalScheduled === 0) return 0;
    return completedScheduled / totalScheduled;
  } else {
    // For weekly-target habits
    const startMonday = getWeekInterval(startRange).start;
    const endMonday = getWeekInterval(to).start;
    
    const weekMondays: string[] = [];
    let curMonday = startMonday;
    while (curMonday <= endMonday) {
      weekMondays.push(curMonday);
      curMonday = addDays(curMonday, 7);
    }
    
    if (weekMondays.length === 0) return 0;
    
    let totalCapRate = 0;
    const target = habit.schedule.weeklyTarget;
    for (const monday of weekMondays) {
      const sunday = addDays(monday, 6);
      const completedCount = entries.filter(e => 
        e.habitId === habit.id && 
        e.date >= monday && 
        e.date <= sunday && 
        e.completed
      ).length;
      
      totalCapRate += Math.min(1.0, completedCount / target);
    }
    
    return totalCapRate / weekMondays.length;
  }
}

// ============================================================================
// SEVEN-DAY COMPLETION VISUALIZATION AND SUMMARY STATISTICS ENGINE
// ============================================================================

export interface DailySummary {
  date: string;
  scheduledOpportunities: number;
  completedCount: number;
  completionPercentage: number;
  isToday: boolean;
}

export interface SevenDaySummaryResult {
  dailySummaries: DailySummary[];
  sevenDayCompletionRate: number;
  bestDay: string;
  bestDayDate: string | null;
  bestDayPercentage: number;
  trend: 'Improving' | 'Declining' | 'Steady' | 'Not enough data';
}

export function getPastNDays(todayStr: string, n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    dates.push(addDays(todayStr, -i));
  }
  return dates;
}

export function calculateSevenDaySummary(
  habits: Habit[],
  entries: HabitEntry[],
  today: string
): SevenDaySummaryResult {
  const latest7Dates = getPastNDays(today, 7);
  const previous7Dates = getPastNDays(addDays(today, -7), 7);

  // Helper to calculate daily summary and total opportunities/completions for a set of dates
  const getPeriodStats = (dates: string[]) => {
    let totalScheduled = 0;
    let totalCompleted = 0;
    const dailySummaries: DailySummary[] = [];

    for (const date of dates) {
      let scheduledOpportunities = 0;
      let completedCount = 0;

      for (const habit of habits) {
        if (habit.schedule.type !== 'weekly_target') {
          if (isHabitScheduledOnDate(habit, date)) {
            scheduledOpportunities++;
            const isCompleted = entries.some(e => e.habitId === habit.id && e.date === date && e.completed);
            if (isCompleted) {
              completedCount++;
            }
          }
        } else {
          // Weekly target habit: Count an actual recorded completion on the day it occurred.
          // Do not create a daily failure for days without an entry.
          // Exclude weekly-target habits from the normal scheduled-opportunity denominator
          // unless there's an actual completion on that date, in which case we count both
          // a completion and a scheduled opportunity to keep the percentage bounded and math honest.
          const isCompleted = entries.some(e => e.habitId === habit.id && e.date === date && e.completed);
          if (isCompleted) {
            completedCount++;
            scheduledOpportunities++;
          }
        }
      }

      const completionPercentage = scheduledOpportunities > 0 ? (completedCount / scheduledOpportunities) * 100 : 0;
      dailySummaries.push({
        date,
        scheduledOpportunities,
        completedCount,
        completionPercentage,
        isToday: date === today
      });

      totalScheduled += scheduledOpportunities;
      totalCompleted += completedCount;
    }

    return {
      dailySummaries,
      totalScheduled,
      totalCompleted
    };
  };

  const latestStats = getPeriodStats(latest7Dates);
  const previousStats = getPeriodStats(previous7Dates);

  // 1. Overall seven-day rate: Total completed scheduled opportunities divided by total scheduled opportunities.
  const sevenDayCompletionRate = latestStats.totalScheduled > 0 
    ? latestStats.totalCompleted / latestStats.totalScheduled 
    : 0;

  // 2. Best completed day:
  // - Use completion percentage
  // - When percentages tie, prefer the date with more scheduled opportunities
  // - If still tied, prefer the more recent date (later index)
  // - If no day had scheduled opportunities, show "No scheduled days yet."
  let bestDayObj: DailySummary | null = null;
  for (const ds of latestStats.dailySummaries) {
    if (ds.scheduledOpportunities === 0) continue;
    if (!bestDayObj) {
      bestDayObj = ds;
    } else {
      const currentBestPct = bestDayObj.completionPercentage;
      const currentBestOpp = bestDayObj.scheduledOpportunities;
      
      if (ds.completionPercentage > currentBestPct) {
        bestDayObj = ds;
      } else if (Math.abs(ds.completionPercentage - currentBestPct) < 0.0001) {
        if (ds.scheduledOpportunities > currentBestOpp) {
          bestDayObj = ds;
        } else if (ds.scheduledOpportunities === currentBestOpp) {
          // Prefer more recent date
          bestDayObj = ds;
        }
      }
    }
  }

  let bestDay = 'No scheduled days yet.';
  let bestDayDate: string | null = null;
  let bestDayPercentage = 0;
  if (bestDayObj) {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dObj = parseLocalDate(bestDayObj.date);
    const dayLabel = daysOfWeek[dObj.getDay()];
    bestDayPercentage = Math.round(bestDayObj.completionPercentage);
    bestDay = `${dayLabel} (${bestDayPercentage}%)`;
    bestDayDate = bestDayObj.date;
  }

  // 3. Current consistency trend compared with the previous seven-day period:
  // - Compare completion rate of latest 7 days vs previous 7 days
  // - Improving: new rate is at least 5 percentage points higher (>= 0.05)
  // - Declining: new rate is at least 5 percentage points lower (<= -0.05)
  // - Otherwise: Steady
  // - If either period has no scheduled opportunities, show "Not enough data"
  let trend: 'Improving' | 'Declining' | 'Steady' | 'Not enough data' = 'Not enough data';
  if (latestStats.totalScheduled > 0 && previousStats.totalScheduled > 0) {
    const latestRate = latestStats.totalCompleted / latestStats.totalScheduled;
    const previousRate = previousStats.totalCompleted / previousStats.totalScheduled;
    
    const diff = latestRate - previousRate;
    if (diff >= 0.05) {
      trend = 'Improving';
    } else if (diff <= -0.05) {
      trend = 'Declining';
    } else {
      trend = 'Steady';
    }
  }

  return {
    dailySummaries: latestStats.dailySummaries,
    sevenDayCompletionRate,
    bestDay,
    bestDayDate,
    bestDayPercentage,
    trend
  };
}

