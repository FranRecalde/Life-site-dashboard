import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Plus, 
  Archive, 
  CheckCircle2, 
  Loader2, 
  AlertTriangle, 
  Calendar, 
  X, 
  Info, 
  RefreshCw,
  Square,
  ChevronRight,
  MoreVertical,
  TrendingUp,
  TrendingDown,
  Minus,
  Edit2,
  History,
  RotateCcw,
  ChevronLeft
} from 'lucide-react';
import { ApiClient } from '../services/apiClient';
import { Habit, HabitEntry, Weekday, DashboardContext, HabitSchedule } from '../types';
import { 
  getLocalYYYYMMDD, 
  isHabitScheduledOnDate, 
  calculateScheduledHabitStreak, 
  calculateWeeklyTargetProgress,
  calculateSevenDaySummary,
  parseLocalDate,
  addDays
} from '../services/habitEngine';

const getDatesInRange = (start: string, end: string): string[] => {
  const dates: string[] = [];
  let current = end;
  while (current >= start) {
    dates.push(current);
    const parts = current.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() - 1);
    
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    current = `${yyyy}-${mm}-${dd}`;
  }
  return dates;
};

interface HabitPanelProps {
  activeTab: DashboardContext;
}

export const HabitPanel: React.FC<HabitPanelProps> = ({ activeTab }) => {
  const [habits, setHabits] = useState<(Habit & { entries: HabitEntry[] })[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [savingHabitIds, setSavingHabitIds] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  
  // Archiving / menu popups
  const [activeMenuHabitId, setActiveMenuHabitId] = useState<string | null>(null);
  
  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [newHabitName, setNewHabitName] = useState<string>('');
  const [newHabitContext, setNewHabitContext] = useState<'personal' | 'professional'>('personal');
  const [newScheduleType, setNewScheduleType] = useState<'daily' | 'weekdays' | 'selected_days' | 'weekly_target'>('daily');
  const [newSelectedDays, setNewSelectedDays] = useState<Weekday[]>([]);
  const [newWeeklyTarget, setNewWeeklyTarget] = useState<number>(3);
  const [newStartDate, setNewStartDate] = useState<string>('');
  const [addLoading, setAddLoading] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Schedule Warning
  const [showScheduleWarning, setShowScheduleWarning] = useState<boolean>(false);
  const [hasConfirmedScheduleWarning, setHasConfirmedScheduleWarning] = useState<boolean>(false);

  // Archived Habits Manager
  const [isArchivedModalOpen, setIsArchivedModalOpen] = useState<boolean>(false);
  const [archivedHabits, setArchivedHabits] = useState<(Habit & { entries: HabitEntry[] })[]>([]);
  const [archivedLoading, setArchivedLoading] = useState<boolean>(false);
  const [archivedTab, setArchivedTab] = useState<'combined' | 'personal' | 'professional'>('combined');

  // Compact History View
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [historyHabit, setHistoryHabit] = useState<(Habit & { entries: HabitEntry[] }) | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HabitEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySavingDate, setHistorySavingDate] = useState<string | null>(null);
  const [historyOffsetDays, setHistoryOffsetDays] = useState<number>(0);

  const [isStatsCollapsed, setIsStatsCollapsed] = useState<boolean>(false);

  const today = useMemo(() => getLocalYYYYMMDD(), []);

  // Compute all entries and 7-day summary statistics
  const allEntries = useMemo(() => {
    return habits.flatMap(h => h.entries);
  }, [habits]);

  const sevenDaySummary = useMemo(() => {
    return calculateSevenDaySummary(habits, allEntries, today);
  }, [habits, allEntries, today]);

  // Fetch Habits
  const fetchHabits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch active habits (not archived) for the current context
      const data = await ApiClient.getHabits({ 
        context: activeTab,
        includeArchived: false
      });
      setHabits(data);
    } catch (err: any) {
      console.error('Failed to load habits:', err);
      setError(err.message || 'Failed to load habits. Please verify your connection.');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  // Pre-select context in Add Modal based on current active tab
  useEffect(() => {
    if (activeTab === 'professional') {
      setNewHabitContext('professional');
    } else {
      setNewHabitContext('personal');
    }
    setNewStartDate(today);
  }, [activeTab, isAddModalOpen, today]);

  // Close menus on click outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMenuHabitId(null);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Escape key handler for closing modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isHistoryModalOpen) {
          setIsHistoryModalOpen(false);
        } else if (isArchivedModalOpen) {
          setIsArchivedModalOpen(false);
        } else if (isAddModalOpen) {
          setIsAddModalOpen(false);
          setEditingHabitId(null);
          setAddError(null);
          setShowScheduleWarning(false);
          setHasConfirmedScheduleWarning(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddModalOpen, isArchivedModalOpen, isHistoryModalOpen]);

  // Prevent background body scrolling when modals are open
  useEffect(() => {
    const anyOpen = isAddModalOpen || isArchivedModalOpen || isHistoryModalOpen;
    if (anyOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [isAddModalOpen, isArchivedModalOpen, isHistoryModalOpen]);

  // Toggle Completion (Ticking / Unticking)
  const handleToggleComplete = async (habit: Habit & { entries: HabitEntry[] }, currentlyCompleted: boolean) => {
    const habitId = habit.id;
    if (savingHabitIds[habitId]) return;

    // Save previous state for rollback
    const previousHabits = [...habits];

    // Optimistic Update
    setHabits(prevHabits => {
      return prevHabits.map(h => {
        if (h.id !== habitId) return h;
        
        let updatedEntries = [...h.entries];
        const existingEntryIdx = updatedEntries.findIndex(e => e.date === today);

        if (existingEntryIdx > -1) {
          updatedEntries[existingEntryIdx] = {
            ...updatedEntries[existingEntryIdx],
            completed: !currentlyCompleted,
            completedAt: !currentlyCompleted ? new Date().toISOString() : null,
            updatedAt: new Date().toISOString()
          };
        } else {
          updatedEntries.push({
            habitId,
            date: today,
            completed: !currentlyCompleted,
            completedAt: !currentlyCompleted ? new Date().toISOString() : null,
            updatedAt: new Date().toISOString()
          });
        }

        return {
          ...h,
          entries: updatedEntries
        };
      });
    });

    setSavingHabitIds(prev => ({ ...prev, [habitId]: true }));
    setRowErrors(prev => {
      const copy = { ...prev };
      delete copy[habitId];
      return copy;
    });

    try {
      await ApiClient.updateHabitEntry(habitId, today, !currentlyCompleted);
      
      // Fetch fresh recalculated data from server to keep stats/streaks perfectly accurate
      const freshData = await ApiClient.getHabits({ 
        context: activeTab,
        includeArchived: false
      });
      setHabits(freshData);
    } catch (err: any) {
      console.error('Failed to update habit check-in:', err);
      // Rollback
      setHabits(previousHabits);
      setRowErrors(prev => ({ 
        ...prev, 
        [habitId]: err.message || 'Failed to save' 
      }));
    } finally {
      setSavingHabitIds(prev => ({ ...prev, [habitId]: false }));
    }
  };

  // Archive Habit
  const handleArchiveHabit = async (e: React.MouseEvent, habitId: string) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      'Archive this habit? Its previous check-ins and statistics will be preserved.'
    );
    if (!confirmed) return;

    try {
      await ApiClient.updateHabit(habitId, { archived: true });
      // Refresh list
      const freshData = await ApiClient.getHabits({ 
        context: activeTab,
        includeArchived: false
      });
      setHabits(freshData);
    } catch (err: any) {
      console.error('Failed to archive habit:', err);
      alert('Failed to archive habit: ' + (err.message || 'Unknown error'));
    }
  };

  // Fetch Archived Habits on demand
  const fetchArchivedHabits = async () => {
    setArchivedLoading(true);
    try {
      const data = await ApiClient.getHabits({ 
        includeArchived: true 
      });
      const archived = data.filter(h => h.archived);
      setArchivedHabits(archived);
    } catch (err: any) {
      console.error('Failed to fetch archived habits:', err);
    } finally {
      setArchivedLoading(false);
    }
  };

  // Restore Archived Habit
  const handleRestoreHabit = async (habitId: string) => {
    try {
      await ApiClient.updateHabit(habitId, { archived: false });
      
      // Remove from archived habits in state
      setArchivedHabits(prev => prev.filter(h => h.id !== habitId));
      
      // Refresh active habits list
      const freshData = await ApiClient.getHabits({ 
        context: activeTab,
        includeArchived: false
      });
      setHabits(freshData);
    } catch (err: any) {
      console.error('Failed to restore habit:', err);
      alert('Failed to restore habit: ' + (err.message || 'Unknown error'));
    }
  };

  // Populate Add Habit Modal for Editing
  const handleEditHabitClick = (habit: Habit & { entries: HabitEntry[] }) => {
    setEditingHabitId(habit.id);
    setNewHabitName(habit.name);
    setNewHabitContext(habit.context);
    
    const schedule = habit.schedule;
    setNewScheduleType(schedule.type);
    if (schedule.type === 'selected_days') {
      setNewSelectedDays(schedule.selectedDays || []);
    } else {
      setNewSelectedDays([]);
    }

    if (schedule.type === 'weekly_target') {
      setNewWeeklyTarget(schedule.weeklyTarget || 3);
    } else {
      setNewWeeklyTarget(3);
    }

    setNewStartDate(habit.startDate);
    setAddError(null);
    setShowScheduleWarning(false);
    setHasConfirmedScheduleWarning(false);
    setIsAddModalOpen(true);
    setActiveMenuHabitId(null);
  };

  // Open Compact History Modal
  const handleHistoryClick = (habit: Habit & { entries: HabitEntry[] }) => {
    setHistoryHabit(habit);
    setHistoryEntries(habit.entries);
    setHistoryOffsetDays(0);
    setHistoryError(null);
    setIsHistoryModalOpen(true);
    setActiveMenuHabitId(null);
  };

  // Fetch History Range (idempotent helper)
  const getHistoryDateRange = (offset: number) => {
    const end = addDays(today, -offset);
    const start = addDays(end, -29);
    return { start, end };
  };

  const fetchHistoryRange = async (habitId: string, offset: number) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const { start, end } = getHistoryDateRange(offset);
      const res = await ApiClient.getHabitHistory(habitId, start, end);
      setHistoryEntries(res.entries);
    } catch (err: any) {
      console.error('Failed to fetch history range:', err);
      setHistoryError(err.message || 'Failed to load history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Effect to automatically fetch history on range navigation
  useEffect(() => {
    if (isHistoryModalOpen && historyHabit) {
      fetchHistoryRange(historyHabit.id, historyOffsetDays);
    }
  }, [isHistoryModalOpen, historyHabit?.id, historyOffsetDays]);

  // Toggle Check-in for Past Date in History Modal
  const handleToggleHistoryEntry = async (date: string, isCurrentlyCompleted: boolean) => {
    if (!historyHabit) return;
    if (historySavingDate) return;

    setHistorySavingDate(date);
    setHistoryError(null);

    try {
      await ApiClient.updateHabitEntry(historyHabit.id, date, !isCurrentlyCompleted);

      // Update history entries state
      setHistoryEntries(prev => {
        const idx = prev.findIndex(e => e.date === date);
        if (idx > -1) {
          return prev.map((e, i) => i === idx ? { ...e, completed: !isCurrentlyCompleted } : e);
        } else {
          return [...prev, { habitId: historyHabit.id, date, completed: !isCurrentlyCompleted }];
        }
      });

      // Update active/archived habits in main state so that streaks & 7-day chart update immediately
      setHabits(prev => prev.map(h => {
        if (h.id === historyHabit.id) {
          const updatedEntries = [...h.entries];
          const idx = updatedEntries.findIndex(e => e.date === date);
          if (idx > -1) {
            updatedEntries[idx] = { 
              ...updatedEntries[idx], 
              completed: !isCurrentlyCompleted,
              completedAt: !isCurrentlyCompleted ? new Date().toISOString() : null,
              updatedAt: new Date().toISOString()
            };
          } else {
            updatedEntries.push({ 
              habitId: historyHabit.id, 
              date, 
              completed: !isCurrentlyCompleted,
              completedAt: !isCurrentlyCompleted ? new Date().toISOString() : null,
              updatedAt: new Date().toISOString()
            });
          }
          return { ...h, entries: updatedEntries };
        }
        return h;
      }));
    } catch (err: any) {
      console.error('Failed to toggle past habit check-in:', err);
      setHistoryError(err.message || 'Failed to save historical check-in.');
    } finally {
      setHistorySavingDate(null);
    }
  };

  // Create or Update Habit Form Submission
  const handleAddHabitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitName.trim()) {
      setAddError('Please enter a habit name.');
      return;
    }

    let schedule: HabitSchedule;
    if (newScheduleType === 'daily') {
      schedule = { type: 'daily' };
    } else if (newScheduleType === 'weekdays') {
      schedule = { type: 'weekdays' };
    } else if (newScheduleType === 'selected_days') {
      if (newSelectedDays.length === 0) {
        setAddError('Please select at least one day.');
        return;
      }
      schedule = { type: 'selected_days', selectedDays: newSelectedDays };
    } else {
      if (newWeeklyTarget < 1) {
        setAddError('Weekly target must be at least 1.');
        return;
      }
      schedule = { type: 'weekly_target', weeklyTarget: Math.floor(newWeeklyTarget) };
    }

    const targetStartDate = newStartDate || today;

    if (editingHabitId) {
      const habitToEdit = habits.find(h => h.id === editingHabitId) || archivedHabits.find(h => h.id === editingHabitId);
      if (!habitToEdit) {
        setAddError('Habit not found.');
        return;
      }

      // 1. Client-side start date check
      const completedBeforeProposed = habitToEdit.entries.filter(e => e.completed && e.date < targetStartDate);
      if (completedBeforeProposed.length > 0) {
        setAddError(`Cannot set start date to ${targetStartDate} because there are completed check-ins on earlier dates.`);
        return;
      }

      // 2. Schedule change warning detection
      const scheduleChanged = (
        habitToEdit.schedule.type !== newScheduleType ||
        (newScheduleType === 'selected_days' && JSON.stringify([...(habitToEdit.schedule.selectedDays || [])].sort()) !== JSON.stringify([...newSelectedDays].sort())) ||
        (newScheduleType === 'weekly_target' && habitToEdit.schedule.weeklyTarget !== newWeeklyTarget)
      );

      if (scheduleChanged && !hasConfirmedScheduleWarning) {
        setShowScheduleWarning(true);
        return;
      }

      setAddLoading(true);
      setAddError(null);

      try {
        const updated = await ApiClient.updateHabit(editingHabitId, {
          name: newHabitName.trim(),
          context: newHabitContext,
          schedule,
          startDate: targetStartDate
        });

        // Update active habits in state
        setHabits(prev => prev.map(h => {
          if (h.id === editingHabitId) {
            return { ...h, ...updated };
          }
          return h;
        }));

        // Update archived habits in state if editing an archived habit
        setArchivedHabits(prev => prev.map(h => {
          if (h.id === editingHabitId) {
            return { ...h, ...updated };
          }
          return h;
        }));

        setIsAddModalOpen(false);
        setEditingHabitId(null);
        setShowScheduleWarning(false);
        setHasConfirmedScheduleWarning(false);
      } catch (err: any) {
        console.error('Failed to update habit:', err);
        setAddError(err.message || 'Failed to update habit.');
      } finally {
        setAddLoading(false);
      }
      return;
    }

    setAddLoading(true);
    setAddError(null);

    try {
      await ApiClient.createHabit({
        name: newHabitName.trim(),
        context: newHabitContext,
        schedule,
        startDate: targetStartDate
      });

      // Reset fields
      setNewHabitName('');
      setNewScheduleType('daily');
      setNewSelectedDays([]);
      setNewWeeklyTarget(3);
      setIsAddModalOpen(false);
      
      // Reload only Habits list
      const freshData = await ApiClient.getHabits({ 
        context: activeTab,
        includeArchived: false
      });
      setHabits(freshData);
    } catch (err: any) {
      console.error('Failed to create habit:', err);
      setAddError(err.message || 'Failed to create habit.');
    } finally {
      setAddLoading(false);
    }
  };

  const toggleDaySelection = (day: Weekday) => {
    setNewSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  // Header Calculations
  const scheduledMetrics = useMemo(() => {
    const scheduledHabits = habits.filter(h => h.schedule.type !== 'weekly_target');
    const scheduledToday = scheduledHabits.filter(h => isHabitScheduledOnDate(h, today));
    const completedToday = scheduledToday.filter(h => 
      h.entries.some(e => e.date === today && e.completed)
    );

    return {
      totalDueToday: scheduledToday.length,
      completedTodayCount: completedToday.length
    };
  }, [habits, today]);

  const weeklyMetrics = useMemo(() => {
    const weeklyHabits = habits.filter(h => h.schedule.type === 'weekly_target');
    const metCount = weeklyHabits.filter(h => {
      const progress = calculateWeeklyTargetProgress(h, h.entries, today);
      return progress.currentWeekCompleted >= progress.currentWeekTarget;
    }).length;

    return {
      totalWeekly: weeklyHabits.length,
      metTargetCount: metCount
    };
  }, [habits, today]);

  const weekdaysList: { label: string; value: Weekday }[] = [
    { label: 'M', value: 'monday' },
    { label: 'T', value: 'tuesday' },
    { label: 'W', value: 'wednesday' },
    { label: 'T', value: 'thursday' },
    { label: 'F', value: 'friday' },
    { label: 'S', value: 'saturday' },
    { label: 'S', value: 'sunday' }
  ];

  return (
    <section className="col-span-1 lg:col-span-6 bg-white dark:bg-[#131b2e] rounded-xl border border-[#eaedff] dark:border-[#283044] shadow-sm p-4 sm:p-6 overflow-hidden flex flex-col h-full min-h-0">
      
      {/* Header Area */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-[#00288e] dark:text-white uppercase tracking-tight">HABITS</h3>
          <p className="text-xs text-[#757684] mt-0.5 font-medium">Today’s consistency</p>
        </div>
        
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setIsArchivedModalOpen(true);
              fetchArchivedHabits();
            }}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded-lg transition-colors cursor-pointer select-none"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archived</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingHabitId(null);
              setNewHabitName('');
              setNewHabitContext(activeTab === 'professional' ? 'professional' : 'personal');
              setNewScheduleType('daily');
              setNewSelectedDays([]);
              setNewWeeklyTarget(3);
              setNewStartDate(today);
              setAddError(null);
              setShowScheduleWarning(false);
              setHasConfirmedScheduleWarning(false);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1 bg-[#00288e] hover:bg-[#1e40af] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb] text-white text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded-lg transition-colors cursor-pointer select-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Habit</span>
          </button>
        </div>
      </div>

      {/* Progress Summary Metric Bars */}
      {!loading && !error && habits.length > 0 && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[#faf8ff] dark:bg-[#1a2c4d]/20 border border-[#eaedff] dark:border-[#283044]/60 rounded-xl">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase text-[#757684] tracking-wider block">Scheduled Today</span>
            <span className="text-xs font-bold text-[#131b2e] dark:text-white">
              {scheduledMetrics.completedTodayCount} of {scheduledMetrics.totalDueToday} completed
            </span>
          </div>
          
          <div className="space-y-1 sm:border-l sm:border-[#eaedff] dark:sm:border-[#283044] sm:pl-3">
            <span className="text-[10px] font-extrabold uppercase text-[#757684] tracking-wider block">Weekly Targets</span>
            <span className="text-xs font-bold text-[#131b2e] dark:text-white">
              {weeklyMetrics.metTargetCount} of {weeklyMetrics.totalWeekly} target{weeklyMetrics.totalWeekly !== 1 ? 's' : ''} met
            </span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-[#757684]">
          <Loader2 className="w-6 h-6 animate-spin text-[#00288e] dark:text-[#3b82f6] mb-2" />
          <span className="text-xs font-medium">Loading habits...</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="flex-1 flex flex-col justify-center items-center py-12 text-center">
          <AlertTriangle className="w-8 h-8 text-[#ba1a1a] mb-2" />
          <p className="text-xs text-[#ba1a1a] font-semibold mb-3 max-w-xs">{error}</p>
          <button
            onClick={fetchHabits}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#faf8ff] dark:bg-[#0c1322] border border-[#eaedff] dark:border-[#283044] rounded-md text-[10px] font-bold text-[#00288e] dark:text-white hover:bg-[#00288e] hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry Load</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && habits.length === 0 && (
        <div className="flex-1 flex flex-col justify-center items-center py-12 border border-dashed border-[#eaedff] dark:border-[#283044] rounded-xl bg-[#faf8ff]/50 dark:bg-[#0c1322]/10">
          <Calendar className="w-8 h-8 text-[#c4c5d5] mb-2" />
          <p className="text-xs font-bold text-[#131b2e] dark:text-white mb-1">No habits found</p>
          <p className="text-[11px] text-[#757684] text-center max-w-xs px-4">
            Create a habit to track your consistency for {activeTab === 'combined' ? 'personal and professional' : activeTab} objectives.
          </p>
        </div>
      )}

      {/* Habits Content List */}
      {!loading && !error && habits.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 text-left max-h-[30rem] scrollbar-thin">
          {habits.map(habit => {
            const isWeekly = habit.schedule.type === 'weekly_target';
            const isSaving = !!savingHabitIds[habit.id];
            const rowError = rowErrors[habit.id];
            
            // Check completed today
            const isCompletedToday = habit.entries.some(e => e.date === today && e.completed);

            let rowStatusText = '';
            let isScheduledToday = false;
            let currentStreakVal = 0;
            let longestStreakVal = 0;
            let weeklyCompleted = 0;
            let weeklyTargetVal = 0;

            if (!isWeekly) {
              isScheduledToday = isHabitScheduledOnDate(habit, today);
              const streakData = calculateScheduledHabitStreak(habit, habit.entries, today);
              currentStreakVal = streakData.currentStreak;
              longestStreakVal = streakData.longestStreak;

              if (isCompletedToday) {
                rowStatusText = 'Completed today';
              } else if (isScheduledToday) {
                rowStatusText = 'Due today';
              } else {
                rowStatusText = 'Not scheduled today';
              }
            } else {
              const weeklyData = calculateWeeklyTargetProgress(habit, habit.entries, today);
              weeklyCompleted = weeklyData.currentWeekCompleted;
              weeklyTargetVal = weeklyData.currentWeekTarget;
              currentStreakVal = weeklyData.currentSuccessfulWeeks;
              longestStreakVal = weeklyData.longestSuccessfulWeeks;
            }

            return (
              <div 
                key={habit.id}
                className={`p-3.5 rounded-xl border transition-all relative ${
                  isCompletedToday 
                    ? 'bg-emerald-50/35 border-emerald-200/50 dark:bg-emerald-950/5 dark:border-emerald-800/20' 
                    : !isWeekly && !isScheduledToday
                      ? 'bg-gray-50/50 border-gray-100 dark:bg-gray-900/10 dark:border-gray-800/30 opacity-70'
                      : 'bg-[#faf8ff] dark:bg-[#1a2c4d]/10 border-[#eaedff] dark:border-[#283044]/60'
                } hover:shadow-xs`}
              >
                <div className="flex items-start justify-between gap-3">
                  
                  {/* Left Side: Completion Toggle Checkbox / Tick Box */}
                  <button
                    type="button"
                    onClick={() => handleToggleComplete(habit, isCompletedToday)}
                    disabled={isSaving}
                    aria-label={`Toggle check-in for habit: ${habit.name}`}
                    className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl border border-[#c4c5d5] dark:border-gray-600 flex items-center justify-center bg-white dark:bg-[#131b2e] hover:border-[#00288e] dark:hover:border-blue-500 transition-all cursor-pointer disabled:opacity-50 shrink-0 select-none mt-0.5"
                  >
                    {isSaving ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[#00288e] dark:text-[#3b82f6]" />
                    ) : isCompletedToday ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>

                  {/* Middle Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className={`text-xs font-bold leading-tight break-words truncate ${
                        isCompletedToday 
                          ? 'text-gray-500 dark:text-gray-400 line-through decoration-emerald-500/30' 
                          : 'text-[#131b2e] dark:text-white font-semibold'
                      }`}>
                        {habit.name}
                      </h4>
                      
                      {/* Context indicator in combined view */}
                      {activeTab === 'combined' && (
                        <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded-sm ${
                          habit.context === 'personal'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                        }`}>
                          {habit.context}
                        </span>
                      )}
                    </div>

                    {/* Schedule detail and current status label */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-[#757684]">
                      {!isWeekly ? (
                        <>
                          <span className="font-medium bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">
                            {habit.schedule.type === 'daily' ? 'Every Day' : habit.schedule.type === 'weekdays' ? 'Weekdays' : 'Selected Days'}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                            isCompletedToday
                              ? 'bg-emerald-100/60 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : isScheduledToday
                                ? 'bg-amber-100/60 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-gray-100/60 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400'
                          }`}>
                            {rowStatusText}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-[#131b2e] dark:text-white font-mono bg-blue-50 dark:bg-blue-950/20 px-2 py-0.5 rounded">
                            {weeklyCompleted} of {weeklyTargetVal} this week
                          </span>
                        </>
                      )}
                    </div>

                    {/* Progress bar for weekly targeted habits */}
                    {isWeekly && (
                      <div className="mt-2 max-w-xs">
                        <div className="w-full h-1.5 bg-[#f0f2ff] dark:bg-[#1a2333] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300" 
                            style={{ width: `${Math.min(100, (weeklyCompleted / weeklyTargetVal) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Side: Streaks detail & Actions Menu */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="text-right flex flex-col pr-1 select-none">
                      <span className="text-[10px] font-bold text-[#131b2e] dark:text-white leading-tight font-mono">
                        {isWeekly ? `🔥 ${currentStreakVal} wk${currentStreakVal !== 1 ? 's' : ''}` : `🔥 ${currentStreakVal} day${currentStreakVal !== 1 ? 's' : ''}`}
                      </span>
                      {longestStreakVal > 0 && (
                        <span className="text-[9px] text-[#757684] mt-0.5 font-medium leading-none">
                          Max: {longestStreakVal}
                        </span>
                      )}
                    </div>

                    {/* Unobtrusive Archiving Menu */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuHabitId(activeMenuHabitId === habit.id ? null : habit.id);
                        }}
                        className="p-1 rounded-md text-[#757684] hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none cursor-pointer"
                        title="Habit options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {activeMenuHabitId === habit.id && (
                        <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded-lg shadow-lg z-20 py-1 overflow-hidden">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditHabitClick(habit);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors flex items-center gap-1.5 cursor-pointer border-b border-[#eaedff] dark:border-[#283044]/60"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleHistoryClick(habit);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors flex items-center gap-1.5 cursor-pointer border-b border-[#eaedff] dark:border-[#283044]/60"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>History</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleArchiveHabit(e, habit.id)}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            <span>Archive</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Row level check-in error warning */}
                {rowError && (
                  <div className="mt-2 text-[10px] text-[#ba1a1a] bg-red-50 dark:bg-[#ba1a1a]/10 border border-red-100 dark:border-red-950/20 px-2 py-1 rounded flex items-center gap-1 animate-fadeIn">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span className="truncate">{rowError}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 7-Day Performance Collapsible Insight Panel */}
      {!loading && !error && habits.length > 0 && (
        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={() => setIsStatsCollapsed(!isStatsCollapsed)}
            className="w-full flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[#757684] hover:text-[#00288e] dark:hover:text-blue-400 py-2 border-t border-[#eaedff] dark:border-[#283044]/40 transition-colors cursor-pointer select-none"
          >
            <span>7-Day Performance Details</span>
            <span className="text-[9px] font-bold">{isStatsCollapsed ? 'Show Stats & Chart' : 'Hide Stats & Chart'}</span>
          </button>

          {!isStatsCollapsed && (
            <div className="pt-2.5 border-t border-[#eaedff] dark:border-[#283044]/30 space-y-3.5 animate-fadeIn">
              {/* Summary Statistics Grid */}
              <div className="grid grid-cols-3 gap-2">
                {/* 7-day completion rate */}
                <div className="p-2 bg-gray-50/50 dark:bg-[#1a2c4d]/5 border border-gray-100 dark:border-[#283044]/30 rounded-xl flex flex-col justify-between min-h-[50px]">
                  <span className="text-[8px] font-extrabold uppercase text-[#757684] tracking-wider block">7-Day Rate</span>
                  <span className="text-sm font-extrabold text-[#131b2e] dark:text-white leading-tight font-mono">
                    {Math.round(sevenDaySummary.sevenDayCompletionRate * 100)}%
                  </span>
                </div>

                {/* Best Day */}
                <div className="p-2 bg-gray-50/50 dark:bg-[#1a2c4d]/5 border border-gray-100 dark:border-[#283044]/30 rounded-xl flex flex-col justify-between min-h-[50px]">
                  <span className="text-[8px] font-extrabold uppercase text-[#757684] tracking-wider block">Best Day</span>
                  <span className="text-[10px] font-bold text-[#131b2e] dark:text-white leading-tight truncate" title={sevenDaySummary.bestDay}>
                    {sevenDaySummary.bestDay}
                  </span>
                </div>

                {/* Consistency Trend */}
                <div className="p-2 bg-gray-50/50 dark:bg-[#1a2c4d]/5 border border-gray-100 dark:border-[#283044]/30 rounded-xl flex flex-col justify-between min-h-[50px]">
                  <span className="text-[8px] font-extrabold uppercase text-[#757684] tracking-wider block">Trend</span>
                  <span className={`text-[10px] font-bold leading-tight ${
                    sevenDaySummary.trend === 'Improving' 
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold' 
                      : sevenDaySummary.trend === 'Declining'
                        ? 'text-[#ba1a1a] dark:text-red-400 font-semibold'
                        : sevenDaySummary.trend === 'Steady'
                          ? 'text-blue-600 dark:text-blue-400 font-semibold'
                          : 'text-[#757684]'
                  }`}>
                    {sevenDaySummary.trend}
                  </span>
                </div>
              </div>

              {/* Vertical Bar Chart */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-[#757684] font-extrabold uppercase tracking-wider">
                  <span>Weekly History</span>
                  <span>Oldest to Newest</span>
                </div>

                <div className="grid grid-cols-7 gap-1 h-14 items-end pt-1 pb-0.5">
                  {sevenDaySummary.dailySummaries.map((ds) => {
                    const dateObj = parseLocalDate(ds.date);
                    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const dayLabel = weekdayNames[dateObj.getDay()];
                    const shortLabel = dayLabel.slice(0, 3);
                    
                    const hasOpportunities = ds.scheduledOpportunities > 0;
                    const roundedPct = Math.round(ds.completionPercentage);
                    const barHeight = hasOpportunities ? Math.max(8, roundedPct) : 0; // min 8% for tiny bar
                    
                    const accessibilityLabel = hasOpportunities 
                      ? `${dayLabel}: ${ds.completedCount} of ${ds.scheduledOpportunities} scheduled habits completed, ${roundedPct}%.`
                      : `${dayLabel}: No habits scheduled.`;

                    return (
                      <div 
                        key={ds.date} 
                        className="flex flex-col items-center gap-1 h-full justify-end group cursor-pointer relative"
                        aria-label={accessibilityLabel}
                        title={accessibilityLabel}
                      >
                        {/* Numeric Percentage indicator shown on hover */}
                        <div className="absolute -top-7 bg-[#131b2e] dark:bg-white text-white dark:text-[#131b2e] text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30 shadow-sm border border-[#eaedff] dark:border-[#283044]/30">
                          {hasOpportunities ? `${ds.completedCount}/${ds.scheduledOpportunities} (${roundedPct}%)` : 'None'}
                        </div>

                        {/* Bar background / container */}
                        <div className={`w-full flex items-end justify-center rounded-t h-8 relative ${
                          ds.isToday 
                            ? 'bg-blue-100/40 dark:bg-blue-950/10 ring-1 ring-[#00288e]/10 dark:ring-blue-500/10' 
                            : 'bg-gray-50/50 dark:bg-gray-900/10'
                        }`}>
                          {hasOpportunities ? (
                            <div 
                              className={`w-full rounded-t transition-all duration-300 ${
                                ds.isToday 
                                  ? 'bg-[#00288e] dark:bg-blue-500' 
                                  : 'bg-blue-500/50 dark:bg-blue-600/30 hover:bg-blue-500 dark:hover:bg-blue-500'
                              }`}
                              style={{ height: `${barHeight}%` }}
                            />
                          ) : (
                            <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700 mb-0.5" />
                          )}
                        </div>

                        {/* Day label */}
                        <span className={`text-[8px] font-extrabold uppercase select-none tracking-wider ${
                          ds.isToday 
                            ? 'text-[#00288e] dark:text-blue-400' 
                            : 'text-[#757684]'
                        }`}>
                          {shortLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =======================================================================
          ADD HABIT DIALOG / MODAL
          ======================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded-xl w-[calc(100vw-16px)] max-w-md shadow-2xl p-4 sm:p-6 relative overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)] animate-fadeIn text-left">
            
            <button 
              onClick={() => {
                setIsAddModalOpen(false);
                setAddError(null);
              }}
              className="absolute right-4 top-4 text-[#757684] hover:text-[#ba1a1a] p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4">
              <span className="text-[10px] font-extrabold uppercase bg-[#f2f3ff] text-[#00288e] dark:bg-[#1a2c4d] dark:text-[#a8b8ff] px-2.5 py-1 rounded">
                {editingHabitId ? 'Habit Editor' : 'Habit Creator'}
              </span>
              <h3 className="text-lg font-bold font-display text-[#131b2e] dark:text-white leading-tight">
                {editingHabitId ? 'Edit Habit' : 'Create New Habit'}
              </h3>

              <form onSubmit={handleAddHabitSubmit} className="space-y-4 pt-2">
                {addError && (
                  <div className="bg-[#ffdad6] text-[#ba1a1a] p-2.5 rounded text-xs font-semibold flex items-center gap-1.5 border border-[#ffb4ab]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="text-[11px] leading-snug">{addError}</span>
                  </div>
                )}

                {/* Habit Name */}
                <div className="space-y-1.5">
                  <label htmlFor="habit-name" className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
                    HABIT NAME
                  </label>
                  <input
                    id="habit-name"
                    type="text"
                    value={newHabitName}
                    onChange={(e) => setNewHabitName(e.target.value)}
                    placeholder="Enter habit name (e.g. Daily Meditation, Gym workout)"
                    required
                    disabled={addLoading}
                    className="w-full p-3 border border-[#c4c5d5] dark:border-[#444653] rounded-lg focus:outline-none focus:border-[#00288e] bg-white dark:bg-[#0c1322] text-[#131b2e] dark:text-white text-xs leading-relaxed"
                  />
                </div>

                {/* Context Selector */}
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
                    CONTEXT
                  </span>
                  <div className="flex bg-[#faf8ff] dark:bg-[#0c1322] border border-[#eaedff] dark:border-[#283044]/80 rounded-lg p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setNewHabitContext('personal')}
                      disabled={addLoading}
                      className={`flex-1 py-1.5 px-3 font-semibold rounded-md transition-colors cursor-pointer ${
                        newHabitContext === 'personal'
                          ? 'bg-[#00288e] text-white shadow-sm'
                          : 'text-[#757684] hover:text-[#131b2e] dark:hover:text-white'
                      }`}
                    >
                      Personal
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewHabitContext('professional')}
                      disabled={addLoading}
                      className={`flex-1 py-1.5 px-3 font-semibold rounded-md transition-colors cursor-pointer ${
                        newHabitContext === 'professional'
                          ? 'bg-[#00288e] text-white shadow-sm'
                          : 'text-[#757684] hover:text-[#131b2e] dark:hover:text-white'
                      }`}
                    >
                      Professional
                    </button>
                  </div>
                </div>

                {/* Schedule Type */}
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
                    SCHEDULE TYPE
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {(['daily', 'weekdays', 'selected_days', 'weekly_target'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setNewScheduleType(type)}
                        disabled={addLoading}
                        className={`py-2 px-3 border rounded-lg text-left font-bold capitalize transition-all cursor-pointer ${
                          newScheduleType === type
                            ? 'bg-[#eaedff] border-[#00288e] text-[#00288e] dark:bg-[#1a2c4d] dark:border-blue-500 dark:text-blue-400'
                            : 'border-[#eaedff] dark:border-[#283044] hover:bg-gray-50 dark:hover:bg-gray-800 text-[#757684]'
                        }`}
                      >
                        {type === 'selected_days' ? 'Selected Days' : type === 'weekly_target' ? 'Weekly Target' : type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Days Selector */}
                {newScheduleType === 'selected_days' && (
                  <div className="space-y-2 pt-1 border-t border-[#eaedff] dark:border-[#283044]/50 animate-fadeIn">
                    <span className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
                      SELECT DAYS (At least one)
                    </span>
                    <div className="flex justify-between gap-1 select-none">
                      {weekdaysList.map(day => {
                        const isSelected = newSelectedDays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleDaySelection(day.value)}
                            disabled={addLoading}
                            title={day.value}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#00288e] border-[#00288e] text-white shadow-xs'
                                : 'border-[#eaedff] dark:border-[#283044] bg-[#faf8ff] dark:bg-[#0c1322] hover:bg-gray-100 text-[#757684]'
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Weekly Target Selector */}
                {newScheduleType === 'weekly_target' && (
                  <div className="space-y-1.5 pt-1 border-t border-[#eaedff] dark:border-[#283044]/50 animate-fadeIn">
                    <label htmlFor="weekly-target" className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
                      WEEKLY TARGET
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        id="weekly-target"
                        type="number"
                        min="1"
                        max="7"
                        step="1"
                        value={newWeeklyTarget}
                        onChange={(e) => setNewWeeklyTarget(parseInt(e.target.value, 10) || 1)}
                        required
                        disabled={addLoading}
                        className="w-20 p-2.5 border border-[#c4c5d5] dark:border-[#444653] rounded-lg text-center font-bold text-xs bg-white dark:bg-[#0c1322] text-[#131b2e] dark:text-white"
                      />
                      <span className="text-xs font-semibold text-[#757684]">
                        times per week
                      </span>
                    </div>
                  </div>
                )}

                {/* Start Date */}
                <div className="space-y-1.5 pt-1">
                  <label htmlFor="start-date" className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
                    START DATE
                  </label>
                  <input
                    id="start-date"
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    required
                    disabled={addLoading}
                    className="w-full p-3 border border-[#c4c5d5] dark:border-[#444653] rounded-lg focus:outline-none focus:border-[#00288e] bg-white dark:bg-[#0c1322] text-[#131b2e] dark:text-white text-xs"
                  />
                </div>

                {/* Schedule Warning Container */}
                {showScheduleWarning && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 p-3 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-2 animate-fadeIn">
                    <p className="font-semibold leading-relaxed">
                      Changing the schedule may change how previous streaks and completion rates are calculated. Existing check-ins will be preserved.
                    </p>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowScheduleWarning(false);
                          setHasConfirmedScheduleWarning(false);
                        }}
                        className="px-2 py-1 bg-white dark:bg-[#131b2e] border border-amber-200 dark:border-amber-800/30 rounded font-bold hover:bg-amber-100 transition-colors cursor-pointer text-amber-900"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHasConfirmedScheduleWarning(true);
                          // Trigger form submit programmatically
                          setTimeout(() => {
                            const submitBtn = document.getElementById('submit-habit-btn');
                            if (submitBtn) submitBtn.click();
                          }, 50);
                        }}
                        className="px-2 py-1 bg-amber-600 text-white rounded font-bold hover:bg-amber-700 transition-colors cursor-pointer"
                      >
                        Confirm & Save
                      </button>
                    </div>
                  </div>
                )}

                {/* Form Buttons */}
                <div className="flex justify-end gap-3 pt-3 border-t border-[#eaedff] dark:border-[#283044]/50">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setEditingHabitId(null);
                      setAddError(null);
                      setShowScheduleWarning(false);
                      setHasConfirmedScheduleWarning(false);
                    }}
                    disabled={addLoading}
                    className="px-4 py-2 text-xs font-bold text-[#757684] hover:text-[#131b2e] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="submit-habit-btn"
                    type="submit"
                    disabled={addLoading}
                    className="flex items-center gap-1.5 bg-[#00288e] hover:bg-[#1e40af] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb] text-white text-xs font-bold uppercase tracking-wider py-2 px-5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                  >
                    {addLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{addLoading ? 'Saving...' : 'Save Habit'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Archived Habits Modal */}
      {isArchivedModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded-xl w-[calc(100vw-16px)] max-w-lg shadow-2xl p-4 sm:p-6 relative overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)] text-left flex flex-col">
            
            <button 
              onClick={() => setIsArchivedModalOpen(false)}
              className="absolute right-4 top-4 text-[#757684] hover:text-[#ba1a1a] p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4 flex-1 min-h-0 flex flex-col">
              <div>
                <span className="text-[10px] font-extrabold uppercase bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 px-2.5 py-1 rounded">
                  Archive Room
                </span>
                <h3 className="text-lg font-bold font-display text-[#131b2e] dark:text-white mt-2 leading-tight">
                  Archived Habits
                </h3>
                <p className="text-xs text-[#757684] mt-1 font-medium">
                  Restore habits to resume active tracking or edit their context.
                </p>
              </div>

              {/* Context Selector Tabs inside Archive */}
              <div className="flex bg-[#faf8ff] dark:bg-[#0c1322] border border-[#eaedff] dark:border-[#283044]/80 rounded-lg p-1 text-xs">
                {(['combined', 'personal', 'professional'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setArchivedTab(tab)}
                    className={`flex-1 py-1 px-2 font-bold capitalize rounded-md transition-colors cursor-pointer ${
                      archivedTab === tab
                        ? 'bg-[#00288e] text-white shadow-xs'
                        : 'text-[#757684] hover:text-[#131b2e] dark:hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Archived Content List */}
              <div className="flex-1 overflow-y-auto min-h-[15rem] max-h-[22rem] pr-1 space-y-2.5 scrollbar-thin">
                {archivedLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#00288e] dark:text-blue-500" />
                    <p className="text-[11px] text-[#757684] font-medium">Retrieving archives...</p>
                  </div>
                ) : (
                  (() => {
                    const filtered = archivedHabits.filter(h => {
                      if (archivedTab === 'combined') return true;
                      return h.context === archivedTab;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <Archive className="w-8 h-8 text-[#c4c5d5] dark:text-gray-600 mb-2" />
                          <p className="text-xs font-bold text-[#131b2e] dark:text-white mb-0.5">No archives found</p>
                          <p className="text-[10px] text-[#757684] max-w-xs">
                            Archived habits under the {archivedTab === 'combined' ? 'combined' : archivedTab} view will appear here.
                          </p>
                        </div>
                      );
                    }

                    return filtered.map(habit => {
                      const isWeekly = habit.schedule.type === 'weekly_target';
                      let scheduleLabel = '';
                      if (habit.schedule.type === 'daily') scheduleLabel = 'Every Day';
                      else if (habit.schedule.type === 'weekdays') scheduleLabel = 'Weekdays';
                      else if (habit.schedule.type === 'selected_days') scheduleLabel = 'Selected Days';
                      else if (habit.schedule.type === 'weekly_target') scheduleLabel = `Weekly Target: ${habit.schedule.weeklyTarget}x`;

                      // Compute mock summary streaks
                      const activeStreak = isWeekly ? 0 : calculateScheduledHabitStreak(habit, habit.entries, today).currentStreak;

                      return (
                        <div 
                          key={habit.id}
                          className="p-3 rounded-lg border border-[#eaedff] dark:border-[#283044] bg-[#faf8ff] dark:bg-[#1a2c4d]/10 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 break-words truncate">
                                {habit.name}
                              </h4>
                              <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded-sm bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                                {habit.context}
                              </span>
                            </div>
                            <p className="text-[10px] text-[#757684] mt-1">
                              Schedule: <span className="font-semibold">{scheduleLabel}</span>
                            </p>
                            {activeStreak > 0 && (
                              <p className="text-[9px] text-[#757684] mt-0.5 font-medium">
                                Last active streak: <span className="font-mono font-bold text-emerald-600">🔥 {activeStreak}d</span>
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRestoreHabit(habit.id)}
                            className="flex items-center gap-1 bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-[10px] font-bold uppercase py-1 px-2.5 rounded transition-colors cursor-pointer shrink-0"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                        </div>
                      );
                    })()
                  })()
                )}
              </div>

              <div className="flex justify-end pt-3 border-t border-[#eaedff] dark:border-[#283044]/50">
                <button
                  type="button"
                  onClick={() => setIsArchivedModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#757684] hover:text-[#131b2e] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compact History View Modal */}
      {isHistoryModalOpen && historyHabit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded-xl w-[calc(100vw-16px)] max-w-md shadow-2xl p-4 sm:p-6 relative overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)] text-left flex flex-col">
            
            <button 
              onClick={() => setIsHistoryModalOpen(false)}
              className="absolute right-4 top-4 text-[#757684] hover:text-[#ba1a1a] p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4 flex-1 min-h-0 flex flex-col">
              <div>
                <span className="text-[10px] font-extrabold uppercase bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 px-2.5 py-1 rounded">
                  Logbook History
                </span>
                <h3 className="text-base font-bold font-display text-[#131b2e] dark:text-white mt-2 leading-tight truncate">
                  {historyHabit.name}
                </h3>
                <p className="text-[11px] text-[#757684] font-medium mt-0.5">
                  View and correct check-ins. Updates save automatically.
                </p>
              </div>

              {/* History Date Range and Navigation */}
              <div className="flex items-center justify-between gap-2 p-2.5 bg-[#faf8ff] dark:bg-[#1a2c4d]/20 border border-[#eaedff] dark:border-[#283044]/60 rounded-xl text-xs">
                <div className="font-mono font-bold text-gray-700 dark:text-gray-300">
                  {(() => {
                    const range = getHistoryDateRange(historyOffsetDays);
                    const formatDate = (dateStr: string) => {
                      const parts = dateStr.split('-');
                      if (parts.length !== 3) return dateStr;
                      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    };
                    return `${formatDate(range.start)} – ${formatDate(range.end)}`;
                  })()}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setHistoryOffsetDays(prev => prev + 30)}
                    disabled={historyLoading}
                    className="p-1 rounded bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer disabled:opacity-50"
                    title="Previous 30 days"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryOffsetDays(prev => Math.max(0, prev - 30))}
                    disabled={historyOffsetDays === 0 || historyLoading}
                    className="p-1 rounded bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer disabled:opacity-50"
                    title="Next 30 days"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Log Dates List */}
              <div className="flex-1 overflow-y-auto min-h-[14rem] max-h-[22rem] pr-1 space-y-1.5 scrollbar-thin">
                {historyLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#00288e] dark:text-blue-500" />
                    <p className="text-[11px] text-[#757684] font-medium">Retrieving history log...</p>
                  </div>
                ) : historyError ? (
                  <div className="bg-[#ffdad6] text-[#ba1a1a] p-3 rounded text-xs font-semibold flex items-center gap-1.5 border border-[#ffb4ab]">
                    <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                    <span className="text-[11px] leading-snug">{historyError}</span>
                  </div>
                ) : (
                  (() => {
                    const range = getHistoryDateRange(historyOffsetDays);
                    const dates = getDatesInRange(range.start, range.end);
                    const filteredDates = dates.filter(d => d >= historyHabit.startDate && d <= today);

                    if (filteredDates.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <Calendar className="w-8 h-8 text-[#c4c5d5] dark:text-gray-600 mb-2" />
                          <p className="text-xs font-bold text-[#131b2e] dark:text-white mb-0.5">No log entries</p>
                          <p className="text-[10px] text-[#757684] max-w-xs">
                            No dates in this range fall within the habit's active timeline starting from {historyHabit.startDate}.
                          </p>
                        </div>
                      );
                    }

                    return filteredDates.map(date => {
                      const isWeekly = historyHabit.schedule.type === 'weekly_target';
                      const isCompleted = historyEntries.some(e => e.date === date && e.completed);
                      const isScheduled = isWeekly || isHabitScheduledOnDate(historyHabit, date);
                      const isSaving = historySavingDate === date;

                      // Format date row header
                      const parts = date.split('-');
                      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                      const dayName = d.toLocaleDateString(undefined, { weekday: 'long' });
                      const formattedDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

                      return (
                        <div 
                          key={date}
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 text-left ${
                            isCompleted 
                              ? 'bg-emerald-50/25 border-emerald-200/40 dark:bg-emerald-950/5 dark:border-emerald-800/15'
                              : !isScheduled
                                ? 'bg-gray-50/40 border-gray-100 dark:bg-gray-900/5 dark:border-gray-800/20 opacity-60'
                                : 'bg-white dark:bg-transparent border-[#eaedff] dark:border-[#283044]/60'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Checkbox Toggle */}
                            <button
                              type="button"
                              disabled={!isScheduled || isSaving}
                              onClick={() => handleToggleHistoryEntry(date, isCompleted)}
                              className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all ${
                                !isScheduled
                                  ? 'border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 cursor-not-allowed text-transparent'
                                  : isCompleted
                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-[#131b2e] hover:border-[#00288e] cursor-pointer'
                              }`}
                            >
                              {isSaving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                              ) : isCompleted ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : null}
                            </button>

                            <div className="min-w-0">
                              <p className={`text-xs font-bold leading-tight ${isCompleted ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-[#131b2e] dark:text-white'}`}>
                                {dayName}
                              </p>
                              <p className="text-[10px] text-[#757684] mt-0.5 font-medium leading-none">
                                {formattedDate}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                              !isScheduled
                                ? 'bg-gray-100 text-gray-500 dark:bg-gray-800/40'
                                : isCompleted
                                  ? 'bg-emerald-100/50 text-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-400'
                                  : isWeekly
                                    ? 'bg-gray-100 text-gray-500 dark:bg-gray-800/40'
                                    : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                            }`}>
                              {!isScheduled ? 'Not Scheduled' : isCompleted ? 'Completed' : isWeekly ? 'Not Completed' : 'Missed'}
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>

              <div className="flex justify-end pt-3 border-t border-[#eaedff] dark:border-[#283044]/50">
                <button
                  type="button"
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#757684] hover:text-[#131b2e] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </section>
  );
};
