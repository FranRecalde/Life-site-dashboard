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
    <section className="col-span-1 lg:col-span-6 bg-[var(--color-card)] bg-[var(--color-card)] rounded-xl border border-[var(--color-divider)] border-[var(--color-divider)] shadow-sm p-4 sm:p-6 overflow-hidden flex flex-col h-full min-h-0">

      {/* Header Area */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-[var(--color-control)] text-[var(--color-ink)] uppercase tracking-tight">HABITS</h3>
          <p className="text-xs text-[var(--color-secondary)] mt-0.5 font-normal">Today’s consistency</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setIsArchivedModalOpen(true);
              fetchArchivedHabits();
            }}
            className="flex items-center gap-1.5 bg-[var(--color-card)] hover:bg-[var(--color-card)] bg-[var(--color-card)] hover:bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] text-[var(--color-ink)] text-[var(--color-secondary)] text-[10px] font-semibold uppercase tracking-wider py-1.5 px-3 rounded-lg transition-colors cursor-pointer select-none"
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
            className="flex items-center gap-1 bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] bg-[var(--color-card-raised)] hover:bg-[var(--color-card-raised)] text-[var(--color-ink)] text-[10px] font-semibold uppercase tracking-wider py-1.5 px-3 rounded-lg transition-colors cursor-pointer select-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Habit</span>
          </button>
        </div>
      </div>

      {/* Progress Summary Metric Bars */}
      {!loading && !error && habits.length > 0 && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[var(--color-card-raised)] bg-[var(--color-card)]/20 border border-[var(--color-divider)] border-[var(--color-divider)]/60 rounded-xl">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase text-[var(--color-secondary)] tracking-wider block">Scheduled Today</span>
            <span className="text-xs font-semibold text-[var(--color-ink)] text-[var(--color-ink)]">
              {scheduledMetrics.completedTodayCount} of {scheduledMetrics.totalDueToday} completed
            </span>
          </div>

          <div className="space-y-1 sm:border-l sm:border-[var(--color-divider)] sm:border-[var(--color-divider)] sm:pl-3">
            <span className="text-[10px] font-semibold uppercase text-[var(--color-secondary)] tracking-wider block">Weekly Targets</span>
            <span className="text-xs font-semibold text-[var(--color-ink)] text-[var(--color-ink)]">
              {weeklyMetrics.metTargetCount} of {weeklyMetrics.totalWeekly} target{weeklyMetrics.totalWeekly !== 1 ? 's' : ''} met
            </span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-[var(--color-secondary)]">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-control)] text-[var(--color-secondary)] mb-2" />
          <span className="text-xs font-normal">Loading habits...</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="flex-1 flex flex-col justify-center items-center py-12 text-center">
          <AlertTriangle className="w-8 h-8 text-[var(--color-warning)] mb-2" />
          <p className="text-xs text-[var(--color-warning)] font-semibold mb-3 max-w-xs">{error}</p>
          <button
            onClick={fetchHabits}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-card-raised)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded-md text-[10px] font-semibold text-[var(--color-control)] text-[var(--color-ink)] hover:bg-[var(--color-card-raised)] hover:text-[var(--color-ink)] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry Load</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && habits.length === 0 && (
        <div className="flex-1 flex flex-col justify-center items-center py-12 border border-dashed border-[var(--color-divider)] border-[var(--color-divider)] rounded-xl bg-[var(--color-card-raised)]/50 bg-[var(--color-card)]/10">
          <Calendar className="w-8 h-8 text-[var(--color-divider)] mb-2" />
          <p className="text-xs font-semibold text-[var(--color-ink)] text-[var(--color-ink)] mb-1">No habits found</p>
          <p className="text-[11px] text-[var(--color-secondary)] text-center max-w-xs px-4">
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
                    ? 'bg-[var(--color-success-surface)] border-[var(--color-success)] bg-[var(--color-success-surface)] border-[var(--color-success)]'
                    : !isWeekly && !isScheduledToday
                      ? 'bg-[var(--color-card)] border-[var(--color-divider)] bg-[var(--color-card)] border-[var(--color-divider)] '
                      : 'bg-[var(--color-card-raised)] bg-[var(--color-card)]/10 border-[var(--color-divider)] border-[var(--color-divider)]/60'
                } hover:shadow-xs`}
              >
                <div className="flex items-start justify-between gap-3">

                  {/* Left Side: Completion Toggle Checkbox / Tick Box */}
                  <button
                    type="button"
                    onClick={() => handleToggleComplete(habit, isCompletedToday)}
                    disabled={isSaving}
                    aria-label={`Toggle check-in for habit: ${habit.name}`}
                    className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl border border-[var(--color-divider)] border-[var(--color-divider)] flex items-center justify-center bg-[var(--color-card)] bg-[var(--color-card)] hover:border-[var(--color-control)] hover:border-[var(--color-divider)] transition-all cursor-pointer disabled:opacity-50 shrink-0 select-none mt-0.5"
                  >
                    {isSaving ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[var(--color-control)] text-[var(--color-secondary)]" />
                    ) : isCompletedToday ? (
                      <CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" />
                    ) : (
                      <Square className="w-5 h-5 text-[var(--color-secondary)] text-[var(--color-secondary)]" />
                    )}
                  </button>

                  {/* Middle Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className={`text-xs font-semibold leading-tight break-words truncate ${
                        isCompletedToday
                          ? 'text-[var(--color-secondary)] text-[var(--color-secondary)] line-through decoration-[var(--color-success)]/30'
                          : 'text-[var(--color-ink)] text-[var(--color-ink)] font-semibold'
                      }`}>
                        {habit.name}
                      </h4>

                      {/* Context indicator in combined view */}
                      {activeTab === 'combined' && (
                        <span className={`text-[8px] font-semibold uppercase px-1.5 py-0.2 rounded-sm ${
                          habit.context === 'personal'
                            ? 'bg-[var(--color-card-raised)] text-[var(--color-secondary)] bg-[var(--color-card-raised)] text-[var(--color-secondary)]'
                            : 'bg-[var(--color-card-raised)] text-[var(--color-secondary)] bg-[var(--color-card-raised)] text-[var(--color-secondary)]'
                        }`}>
                          {habit.context}
                        </span>
                      )}
                    </div>

                    {/* Schedule detail and current status label */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-[var(--color-secondary)]">
                      {!isWeekly ? (
                        <>
                          <span className="font-normal bg-[var(--color-card)] bg-[var(--color-card)] px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">
                            {habit.schedule.type === 'daily' ? 'Every Day' : habit.schedule.type === 'weekdays' ? 'Weekdays' : 'Selected Days'}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${
                            isCompletedToday
                              ? 'bg-[var(--color-success-surface)] text-[var(--color-success)] bg-[var(--color-success-surface)] text-[var(--color-success)]'
                              : isScheduledToday
                                ? 'bg-[var(--color-warning-surface)] text-[var(--color-warning)] bg-[var(--color-warning-surface)] text-[var(--color-warning)]'
                                : 'bg-[var(--color-card)] text-[var(--color-secondary)] bg-[var(--color-card)] text-[var(--color-secondary)]'
                          }`}>
                            {rowStatusText}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-[var(--color-ink)] text-[var(--color-ink)] font-mono bg-[var(--color-card-raised)] bg-[var(--color-card-raised)] px-2 py-0.5 rounded">
                            {weeklyCompleted} of {weeklyTargetVal} this week
                          </span>
                        </>
                      )}
                    </div>

                    {/* Progress bar for weekly targeted habits */}
                    {isWeekly && (
                      <div className="mt-2 max-w-xs">
                        <div className="w-full h-1.5 bg-[var(--color-card-raised)] bg-[var(--color-card)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[var(--color-secondary)] to-[var(--color-secondary)] rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, (weeklyCompleted / weeklyTargetVal) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Side: Streaks detail & Actions Menu */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="text-right flex flex-col pr-1 select-none">
                      <span className="text-[10px] font-semibold text-[var(--color-ink)] text-[var(--color-ink)] leading-tight font-mono">
                        {isWeekly ? `🔥 ${currentStreakVal} wk${currentStreakVal !== 1 ? 's' : ''}` : `🔥 ${currentStreakVal} day${currentStreakVal !== 1 ? 's' : ''}`}
                      </span>
                      {longestStreakVal > 0 && (
                        <span className="text-[9px] text-[var(--color-secondary)] mt-0.5 font-normal leading-none">
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
                        className="p-1 rounded-md text-[var(--color-secondary)] hover:bg-[var(--color-card)]/5 hover:bg-[var(--color-card)]/5 transition-colors focus:outline-none cursor-pointer"
                        title="Habit options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {activeMenuHabitId === habit.id && (
                        <div className="absolute right-0 mt-1 w-32 bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded-lg shadow-lg z-20 py-1 overflow-hidden">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditHabitClick(habit);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-normal text-[var(--color-ink)] text-[var(--color-secondary)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)]/5 transition-colors flex items-center gap-1.5 cursor-pointer border-b border-[var(--color-divider)] border-[var(--color-divider)]/60"
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
                            className="w-full text-left px-3 py-2 text-xs font-normal text-[var(--color-ink)] text-[var(--color-secondary)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)]/5 transition-colors flex items-center gap-1.5 cursor-pointer border-b border-[var(--color-divider)] border-[var(--color-divider)]/60"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>History</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleArchiveHabit(e, habit.id)}
                            className="w-full text-left px-3 py-2 text-xs font-normal text-[var(--color-warning)] hover:text-[var(--color-warning)] text-[var(--color-warning)] hover:text-[var(--color-warning)] hover:bg-[var(--color-warning-surface)] hover:bg-[var(--color-warning-surface)] transition-colors flex items-center gap-1.5 cursor-pointer"
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
                  <div className="mt-2 text-[10px] text-[var(--color-warning)] bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)]/10 border border-[var(--color-warning)] border-[var(--color-warning)] px-2 py-1 rounded flex items-center gap-1 animate-fadeIn">
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
            className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[var(--color-secondary)] hover:text-[var(--color-control)] hover:text-[var(--color-secondary)] py-2 border-t border-[var(--color-divider)] border-[var(--color-divider)]/40 transition-colors cursor-pointer select-none"
          >
            <span>7-Day Performance Details</span>
            <span className="text-[9px] font-semibold">{isStatsCollapsed ? 'Show Stats & Chart' : 'Hide Stats & Chart'}</span>
          </button>

          {!isStatsCollapsed && (
            <div className="pt-2.5 border-t border-[var(--color-divider)] border-[var(--color-divider)]/30 space-y-3.5 animate-fadeIn">
              {/* Summary Statistics Grid */}
              <div className="grid grid-cols-3 gap-2">
                {/* 7-day completion rate */}
                <div className="p-2 bg-[var(--color-card)] bg-[var(--color-card)]/5 border border-[var(--color-divider)] border-[var(--color-divider)]/30 rounded-xl flex flex-col justify-between min-h-[50px]">
                  <span className="text-[8px] font-semibold uppercase text-[var(--color-secondary)] tracking-wider block">7-Day Rate</span>
                  <span className="text-sm font-semibold text-[var(--color-ink)] text-[var(--color-ink)] leading-tight font-mono">
                    {Math.round(sevenDaySummary.sevenDayCompletionRate * 100)}%
                  </span>
                </div>

                {/* Best Day */}
                <div className="p-2 bg-[var(--color-card)] bg-[var(--color-card)]/5 border border-[var(--color-divider)] border-[var(--color-divider)]/30 rounded-xl flex flex-col justify-between min-h-[50px]">
                  <span className="text-[8px] font-semibold uppercase text-[var(--color-secondary)] tracking-wider block">Best Day</span>
                  <span className="text-[10px] font-semibold text-[var(--color-ink)] text-[var(--color-ink)] leading-tight truncate" title={sevenDaySummary.bestDay}>
                    {sevenDaySummary.bestDay}
                  </span>
                </div>

                {/* Consistency Trend */}
                <div className="p-2 bg-[var(--color-card)] bg-[var(--color-card)]/5 border border-[var(--color-divider)] border-[var(--color-divider)]/30 rounded-xl flex flex-col justify-between min-h-[50px]">
                  <span className="text-[8px] font-semibold uppercase text-[var(--color-secondary)] tracking-wider block">Trend</span>
                  <span className={`text-[10px] font-semibold leading-tight ${
                    sevenDaySummary.trend === 'Improving'
                      ? 'text-[var(--color-success)] text-[var(--color-success)] font-semibold'
                      : sevenDaySummary.trend === 'Declining'
                        ? 'text-[var(--color-warning)] text-[var(--color-warning)] font-semibold'
                        : sevenDaySummary.trend === 'Steady'
                          ? 'text-[var(--color-secondary)] text-[var(--color-secondary)] font-semibold'
                          : 'text-[var(--color-secondary)]'
                  }`}>
                    {sevenDaySummary.trend}
                  </span>
                </div>
              </div>

              {/* Vertical Bar Chart */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-[var(--color-secondary)] font-semibold uppercase tracking-wider">
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
                        <div className="absolute -top-7 bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] text-[var(--color-ink)] text-[9px] font-semibold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30 shadow-sm border border-[var(--color-divider)] border-[var(--color-divider)]/30">
                          {hasOpportunities ? `${ds.completedCount}/${ds.scheduledOpportunities} (${roundedPct}%)` : 'None'}
                        </div>

                        {/* Bar background / container */}
                        <div className={`w-full flex items-end justify-center rounded-t h-8 relative ${
                          ds.isToday
                            ? 'bg-[var(--color-card-raised)] border-2 border-[var(--color-current)]'
                            : 'bg-[var(--color-card)] bg-[var(--color-card)]'
                        }`}>
                          {hasOpportunities ? (
                            <div
                              className={`w-full rounded-t transition-all duration-300 ${
                                ds.isToday
                                  ? 'bg-[var(--color-ink)]'
                                  : 'bg-[var(--color-card-raised)] bg-[var(--color-card-raised)] hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card-raised)]'
                              }`}
                              style={{ height: `${barHeight}%` }}
                            />
                          ) : (
                            <div className="w-1 h-1 rounded-full bg-[var(--color-card)] bg-[var(--color-card)] mb-0.5" />
                          )}
                        </div>

                        {/* Day label */}
                        <span className={`text-[8px] font-semibold uppercase select-none tracking-wider ${
                          ds.isToday
                            ? 'text-[var(--color-control)] text-[var(--color-secondary)]'
                            : 'text-[var(--color-secondary)]'
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
        <div className="fixed inset-0 bg-[var(--color-card)]/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded-xl w-[calc(100vw-16px)] max-w-md shadow-2xl p-4 sm:p-6 relative overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)] animate-fadeIn text-left">

            <button
              onClick={() => {
                setIsAddModalOpen(false);
                setAddError(null);
              }}
              className="absolute right-4 top-4 text-[var(--color-secondary)] hover:text-[var(--color-warning)] p-1.5 rounded-full hover:bg-[var(--color-card)]/5 hover:bg-[var(--color-card)]/5 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4">
              <span className="text-[10px] font-semibold uppercase bg-[var(--color-card-raised)] text-[var(--color-control)] bg-[var(--color-card)] text-[var(--color-secondary)] px-2.5 py-1 rounded">
                {editingHabitId ? 'Habit Editor' : 'Habit Creator'}
              </span>
              <h3 className="text-lg font-semibold font-display text-[var(--color-ink)] text-[var(--color-ink)] leading-tight">
                {editingHabitId ? 'Edit Habit' : 'Create New Habit'}
              </h3>

              <form onSubmit={handleAddHabitSubmit} className="space-y-4 pt-2">
                {addError && (
                  <div className="bg-[var(--color-warning-surface)] text-[var(--color-warning)] p-2.5 rounded text-xs font-semibold flex items-center gap-1.5 border border-[var(--color-warning-surface)]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="text-[11px] leading-snug">{addError}</span>
                  </div>
                )}

                {/* Habit Name */}
                <div className="space-y-1.5">
                  <label htmlFor="habit-name" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
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
                    className="w-full p-3 border border-[var(--color-divider)] border-[var(--color-secondary)] rounded-lg focus:outline-none focus:border-[var(--color-control)] bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] text-[var(--color-ink)] text-xs leading-relaxed"
                  />
                </div>

                {/* Context Selector */}
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                    CONTEXT
                  </span>
                  <div className="flex bg-[var(--color-card-raised)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)]/80 rounded-lg p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setNewHabitContext('personal')}
                      disabled={addLoading}
                      className={`flex-1 py-1.5 px-3 font-semibold rounded-md transition-colors cursor-pointer ${
                        newHabitContext === 'personal'
                          ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)] shadow-sm'
                          : 'text-[var(--color-secondary)] hover:text-[var(--color-ink)] hover:text-[var(--color-ink)]'
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
                          ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)] shadow-sm'
                          : 'text-[var(--color-secondary)] hover:text-[var(--color-ink)] hover:text-[var(--color-ink)]'
                      }`}
                    >
                      Professional
                    </button>
                  </div>
                </div>

                {/* Schedule Type */}
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                    SCHEDULE TYPE
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {(['daily', 'weekdays', 'selected_days', 'weekly_target'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setNewScheduleType(type)}
                        disabled={addLoading}
                        className={`py-2 px-3 border rounded-lg text-left font-semibold capitalize transition-all cursor-pointer ${
                          newScheduleType === type
                            ? 'bg-[var(--color-divider)] border-[var(--color-control)] text-[var(--color-control)] bg-[var(--color-card)] border-[var(--color-divider)] text-[var(--color-secondary)]'
                            : 'border-[var(--color-divider)] border-[var(--color-divider)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] text-[var(--color-secondary)]'
                        }`}
                      >
                        {type === 'selected_days' ? 'Selected Days' : type === 'weekly_target' ? 'Weekly Target' : type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Days Selector */}
                {newScheduleType === 'selected_days' && (
                  <div className="space-y-2 pt-1 border-t border-[var(--color-divider)] border-[var(--color-divider)]/50 animate-fadeIn">
                    <span className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
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
                            className={`w-9 h-9 rounded-lg flex items-center justify-center font-semibold text-xs border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[var(--color-card-raised)] border-[var(--color-control)] text-[var(--color-ink)] shadow-xs'
                                : 'border-[var(--color-divider)] border-[var(--color-divider)] bg-[var(--color-card-raised)] bg-[var(--color-card)] hover:bg-[var(--color-card)] text-[var(--color-secondary)]'
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
                  <div className="space-y-1.5 pt-1 border-t border-[var(--color-divider)] border-[var(--color-divider)]/50 animate-fadeIn">
                    <label htmlFor="weekly-target" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
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
                        className="w-20 p-2.5 border border-[var(--color-divider)] border-[var(--color-secondary)] rounded-lg text-center font-semibold text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] text-[var(--color-ink)]"
                      />
                      <span className="text-xs font-semibold text-[var(--color-secondary)]">
                        times per week
                      </span>
                    </div>
                  </div>
                )}

                {/* Start Date */}
                <div className="space-y-1.5 pt-1">
                  <label htmlFor="start-date" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                    START DATE
                  </label>
                  <input
                    id="start-date"
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    required
                    disabled={addLoading}
                    className="w-full p-3 border border-[var(--color-divider)] border-[var(--color-secondary)] rounded-lg focus:outline-none focus:border-[var(--color-control)] bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] text-[var(--color-ink)] text-xs"
                  />
                </div>

                {/* Schedule Warning Container */}
                {showScheduleWarning && (
                  <div className="bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border border-[var(--color-warning)] border-[var(--color-warning)] p-3 rounded-lg text-xs text-[var(--color-warning)] text-[var(--color-warning)] space-y-2 animate-fadeIn">
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
                        className="px-2 py-1 bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-warning)] border-[var(--color-warning)] rounded font-semibold hover:bg-[var(--color-warning-surface)] transition-colors cursor-pointer text-[var(--color-warning)]"
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
                        className="px-2 py-1 bg-[var(--color-warning-surface)] text-[var(--color-ink)] rounded font-semibold hover:bg-[var(--color-warning-surface)] transition-colors cursor-pointer"
                      >
                        Confirm & Save
                      </button>
                    </div>
                  </div>
                )}

                {/* Form Buttons */}
                <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-divider)] border-[var(--color-divider)]/50">
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
                    className="px-4 py-2 text-xs font-semibold text-[var(--color-secondary)] hover:text-[var(--color-ink)] hover:text-[var(--color-ink)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] rounded-lg transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="submit-habit-btn"
                    type="submit"
                    disabled={addLoading}
                    className="flex items-center gap-1.5 bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] bg-[var(--color-card-raised)] hover:bg-[var(--color-card-raised)] text-[var(--color-ink)] text-xs font-semibold uppercase tracking-wider py-2 px-5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
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
        <div className="fixed inset-0 bg-[var(--color-card)]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded-xl w-[calc(100vw-16px)] max-w-lg shadow-2xl p-4 sm:p-6 relative overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)] text-left flex flex-col">

            <button
              onClick={() => setIsArchivedModalOpen(false)}
              className="absolute right-4 top-4 text-[var(--color-secondary)] hover:text-[var(--color-warning)] p-1.5 rounded-full hover:bg-[var(--color-card)]/5 hover:bg-[var(--color-card)]/5 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4 flex-1 min-h-0 flex flex-col">
              <div>
                <span className="text-[10px] font-semibold uppercase bg-[var(--color-card)] text-[var(--color-ink)] bg-[var(--color-card)] text-[var(--color-secondary)] px-2.5 py-1 rounded">
                  Archive Room
                </span>
                <h3 className="text-lg font-semibold font-display text-[var(--color-ink)] text-[var(--color-ink)] mt-2 leading-tight">
                  Archived Habits
                </h3>
                <p className="text-xs text-[var(--color-secondary)] mt-1 font-normal">
                  Restore habits to resume active tracking or edit their context.
                </p>
              </div>

              {/* Context Selector Tabs inside Archive */}
              <div className="flex bg-[var(--color-card-raised)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)]/80 rounded-lg p-1 text-xs">
                {(['combined', 'personal', 'professional'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setArchivedTab(tab)}
                    className={`flex-1 py-1 px-2 font-semibold capitalize rounded-md transition-colors cursor-pointer ${
                      archivedTab === tab
                        ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)] shadow-xs'
                        : 'text-[var(--color-secondary)] hover:text-[var(--color-ink)] hover:text-[var(--color-ink)]'
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
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--color-control)] text-[var(--color-secondary)]" />
                    <p className="text-[11px] text-[var(--color-secondary)] font-normal">Retrieving archives...</p>
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
                          <Archive className="w-8 h-8 text-[var(--color-divider)] text-[var(--color-secondary)] mb-2" />
                          <p className="text-xs font-semibold text-[var(--color-ink)] text-[var(--color-ink)] mb-0.5">No archives found</p>
                          <p className="text-[10px] text-[var(--color-secondary)] max-w-xs">
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
                          className="p-3 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)] bg-[var(--color-card-raised)] bg-[var(--color-card)]/10 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-xs font-semibold text-[var(--color-secondary)] text-[var(--color-secondary)] break-words truncate">
                                {habit.name}
                              </h4>
                              <span className="text-[8px] font-semibold uppercase px-1.5 py-0.2 rounded-sm bg-[var(--color-card)] text-[var(--color-ink)] bg-[var(--color-card)] text-[var(--color-secondary)]">
                                {habit.context}
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--color-secondary)] mt-1">
                              Schedule: <span className="font-semibold">{scheduleLabel}</span>
                            </p>
                            {activeStreak > 0 && (
                              <p className="text-[9px] text-[var(--color-secondary)] mt-0.5 font-normal">
                                Last active streak: <span className="font-mono font-semibold text-[var(--color-success)]">🔥 {activeStreak}d</span>
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRestoreHabit(habit.id)}
                            className="flex items-center gap-1 bg-[var(--color-card)] hover:bg-[var(--color-card)] bg-[var(--color-card)] hover:bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] text-[var(--color-ink)] text-[var(--color-secondary)] text-[10px] font-semibold uppercase py-1 px-2.5 rounded transition-colors cursor-pointer shrink-0"
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

              <div className="flex justify-end pt-3 border-t border-[var(--color-divider)] border-[var(--color-divider)]/50">
                <button
                  type="button"
                  onClick={() => setIsArchivedModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[var(--color-secondary)] hover:text-[var(--color-ink)] hover:text-[var(--color-ink)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] rounded-lg transition-all cursor-pointer"
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
        <div className="fixed inset-0 bg-[var(--color-card)]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded-xl w-[calc(100vw-16px)] max-w-md shadow-2xl p-4 sm:p-6 relative overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)] text-left flex flex-col">

            <button
              onClick={() => setIsHistoryModalOpen(false)}
              className="absolute right-4 top-4 text-[var(--color-secondary)] hover:text-[var(--color-warning)] p-1.5 rounded-full hover:bg-[var(--color-card)]/5 hover:bg-[var(--color-card)]/5 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4 flex-1 min-h-0 flex flex-col">
              <div>
                <span className="text-[10px] font-semibold uppercase bg-[var(--color-card-raised)] text-[var(--color-secondary)] bg-[var(--color-card-raised)] text-[var(--color-secondary)] px-2.5 py-1 rounded">
                  Logbook History
                </span>
                <h3 className="text-base font-semibold font-display text-[var(--color-ink)] text-[var(--color-ink)] mt-2 leading-tight truncate">
                  {historyHabit.name}
                </h3>
                <p className="text-[11px] text-[var(--color-secondary)] font-normal mt-0.5">
                  View and correct check-ins. Updates save automatically.
                </p>
              </div>

              {/* History Date Range and Navigation */}
              <div className="flex items-center justify-between gap-2 p-2.5 bg-[var(--color-card-raised)] bg-[var(--color-card)]/20 border border-[var(--color-divider)] border-[var(--color-divider)]/60 rounded-xl text-xs">
                <div className="font-mono font-semibold text-[var(--color-ink)] text-[var(--color-secondary)]">
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
                    className="p-1 rounded bg-[var(--color-card)] hover:bg-[var(--color-card)] bg-[var(--color-card)] hover:bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] text-[var(--color-ink)] text-[var(--color-secondary)] cursor-pointer disabled:opacity-50"
                    title="Previous 30 days"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryOffsetDays(prev => Math.max(0, prev - 30))}
                    disabled={historyOffsetDays === 0 || historyLoading}
                    className="p-1 rounded bg-[var(--color-card)] hover:bg-[var(--color-card)] bg-[var(--color-card)] hover:bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] text-[var(--color-ink)] text-[var(--color-secondary)] cursor-pointer disabled:opacity-50"
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
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--color-control)] text-[var(--color-secondary)]" />
                    <p className="text-[11px] text-[var(--color-secondary)] font-normal">Retrieving history log...</p>
                  </div>
                ) : historyError ? (
                  <div className="bg-[var(--color-warning-surface)] text-[var(--color-warning)] p-3 rounded text-xs font-semibold flex items-center gap-1.5 border border-[var(--color-warning-surface)]">
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
                          <Calendar className="w-8 h-8 text-[var(--color-divider)] text-[var(--color-secondary)] mb-2" />
                          <p className="text-xs font-semibold text-[var(--color-ink)] text-[var(--color-ink)] mb-0.5">No log entries</p>
                          <p className="text-[10px] text-[var(--color-secondary)] max-w-xs">
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
                              ? 'bg-[var(--color-success-surface)] border-[var(--color-success)] bg-[var(--color-success-surface)] border-[var(--color-success)]'
                              : !isScheduled
                                ? 'bg-[var(--color-card)] border-[var(--color-divider)] bg-[var(--color-card)] border-[var(--color-divider)] '
                                : 'bg-[var(--color-card)] bg-transparent border-[var(--color-divider)] border-[var(--color-divider)]/60'
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
                                  ? 'border-[var(--color-divider)] border-[var(--color-divider)] bg-[var(--color-card)] bg-[var(--color-card)] cursor-not-allowed text-transparent'
                                  : isCompleted
                                    ? 'border-[var(--color-success)] bg-[var(--color-success-surface)] text-[var(--color-ink)]'
                                    : 'border-[var(--color-divider)] border-[var(--color-divider)] bg-[var(--color-card)] bg-[var(--color-card)] hover:border-[var(--color-control)] cursor-pointer'
                              }`}
                            >
                              {isSaving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-secondary)]" />
                              ) : isCompleted ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : null}
                            </button>

                            <div className="min-w-0">
                              <p className={`text-xs font-semibold leading-tight ${isCompleted ? 'text-[var(--color-secondary)] text-[var(--color-secondary)] line-through' : 'text-[var(--color-ink)] text-[var(--color-ink)]'}`}>
                                {dayName}
                              </p>
                              <p className="text-[10px] text-[var(--color-secondary)] mt-0.5 font-normal leading-none">
                                {formattedDate}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                              !isScheduled
                                ? 'bg-[var(--color-card)] text-[var(--color-secondary)] bg-[var(--color-card)]'
                                : isCompleted
                                  ? 'bg-[var(--color-success-surface)] text-[var(--color-success)] bg-[var(--color-success-surface)] text-[var(--color-success)]'
                                  : isWeekly
                                    ? 'bg-[var(--color-card)] text-[var(--color-secondary)] bg-[var(--color-card)]'
                                    : 'bg-[var(--color-warning-surface)] text-[var(--color-warning)] bg-[var(--color-warning-surface)] text-[var(--color-warning)]'
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

              <div className="flex justify-end pt-3 border-t border-[var(--color-divider)] border-[var(--color-divider)]/50">
                <button
                  type="button"
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[var(--color-secondary)] hover:text-[var(--color-ink)] hover:text-[var(--color-ink)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] rounded-lg transition-all cursor-pointer"
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
