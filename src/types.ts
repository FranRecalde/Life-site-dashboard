export type DashboardContext = 'combined' | 'personal' | 'professional';

export type ServiceStatus = {
  provider: 'google_calendar' | 'todoist' | 'obsidian' | 'weather';
  status: 'connected' | 'warning' | 'disconnected';
  lastSuccessfulSync?: string;
  lastError?: string;
};

export type CalendarEvent = {
  id: string;
  provider: 'google_calendar';
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  calendarName?: string;
  context?: 'personal' | 'professional' | 'combined' | 'unknown';
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  recurringEventId?: string | null;
  isRecurring?: boolean;
  organizer?: { email?: string; displayName?: string } | null;
  canEdit?: boolean;
};

export type TodoistSection = {
  id: string;
  name: string;
  projectId: string;
  sectionOrder: number;
  isCollapsed?: boolean;
};

export type TodoistTask = {
  id: string;
  provider: 'todoist';
  title: string;
  description?: string;
  dueDate?: string;
  dueDatetime?: string;
  isOverdue: boolean;
  overdueDays?: number;
  projectId?: string;
  projectName?: string;
  labels: string[];
  priority?: number;
  recurring?: boolean;
  completed?: boolean;
  context?: 'personal' | 'professional' | 'unknown';
  parentId?: string | null;
  childOrder?: number;
  sectionId?: string | null;
};

export type ObsidianNote = {
  id: string;
  title: string;
  path: string;
  folder: string;
  modifiedAt: string;
  preview: string;
  context?: 'personal' | 'professional' | 'favorite' | 'unknown';
  obsidianUri?: string;
};

export type WeatherSnapshot = {
  location: string;
  temperature: number;
  units: 'C' | 'F';
  condition: string;
  icon?: string;
  fetchedAt: string;
};

export type UserSettings = {
  theme: 'light' | 'dark' | 'system';
  refreshIntervalMinutes: number;
  defaultCalendarView: 'day' | 'week' | 'month';
  firstDayOfWeek: 'monday' | 'sunday';
  dateFormat: 'british';
  notesDefaultMode: 'append' | 'new_note';
  obsidian: {
    vaultName: string;
    personalFolder: string;
    professionalFolder: string;
    favoritesFolder: string;
    inboxFolder: string;
    personalInboxFile: string;
    professionalInboxFile: string;
    connectionMode?: 'auto' | 'desktop' | 'mobile';
  };
  todoist: {
    personalLabel: string;
    professionalLabel: string;
  };
  weather: {
    location: string;
    units: 'C' | 'F';
  };
  calendar: {
    selectedCalendarIds: string[];
    selectedCalendarIdsByContext?: {
      combined: string[];
      personal: string[];
      professional: string[];
    };
    workingHoursStart: string;
    workingHoursEnd: string;
  };
};

export type TodoistProjectSummary = {
  id: string;
  name: string;
  color: string;
  isFavorite: boolean;
  parentId: string | null;
  activeTaskCount: number;
  completedTaskCount: number;
  totalTaskCount: number;
  percentageCompleted: number;
  progressScope: "lifetime" | "recent";
};

export type TodoistProjectTask = {
  id: string;
  title: string;
  description: string;
  projectId: string;
  parentId: string | null;
  sectionId: string | null;
  dueDate?: string;
  dueDatetime?: string;
  priority: number;
  labels: string[];
  recurring: boolean;
  completed: boolean;
  completedAt?: string | null;
  context: 'personal' | 'professional' | 'unknown';
};

export type DashboardSnapshot = {
  calendarEvents: CalendarEvent[];
  tasks: TodoistTask[];
  notes: ObsidianNote[];
  todoistProjects: TodoistProjectSummary[];
  weather?: WeatherSnapshot;
  settings: UserSettings;
  serviceStatus: ServiceStatus[];
  fetchedAt: string;
  todoistSections?: TodoistSection[];
  todoistInboxProjectId?: string | null;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: string;
};

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type DailySchedule = {
  type: 'daily';
};

export type WeekdaysSchedule = {
  type: 'weekdays';
};

export type SelectedDaysSchedule = {
  type: 'selected_days';
  selectedDays: Weekday[]; // Stores selected weekdays consistently (lowercase names: monday, tuesday, etc.)
};

export type WeeklyTargetSchedule = {
  type: 'weekly_target';
  weeklyTarget: number; // Positive target number per Monday-to-Sunday week (>= 1)
};

export type HabitSchedule = DailySchedule | WeekdaysSchedule | SelectedDaysSchedule | WeeklyTargetSchedule;

export interface Habit {
  id: string;
  name: string;
  context: 'personal' | 'professional';
  schedule: HabitSchedule;
  startDate: string; // YYYY-MM-DD
  archived: boolean;
  archivedAt?: string; // ISO string
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface HabitEntry {
  habitId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  completedAt: string | null; // ISO string
  updatedAt: string; // ISO string
}

export interface CreateTodoistTaskOptions {
  description?: string;
  projectId?: string;
  sectionId?: string;
  dueDate?: string;
  priority?: number;
}

export interface UpdateTodoistTaskOptions {
  content?: string;
  description?: string;
  dueDate?: string | null;
  priority?: number;
}

export interface MoveTodoistTaskOptions {
  projectId?: string;
  sectionId?: string;
  parentId?: string;
}

export type ReadingSource = 'physical' | 'kindle' | 'audiobook';

export type ReadingCaptureType =
  | 'thought'
  | 'quote_and_thought'
  | 'question'
  | 'action'
  | 'summary';

export type ReadingBookStatus = 'active' | 'archived';

export type ReadingCaptureStatus =
  | 'pending'
  | 'claimed'
  | 'done';

export type ReadingCaptureCreatorType = 'life_site' | 'custom_gpt';

export interface ReadingBook {
  id: string;
  title: string;
  author: string;
  destinationNotePath: string;
  tags: string[];
  defaultSource?: ReadingSource;
  status: ReadingBookStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingCaptureLocator {
  kind: 'page' | 'location' | 'chapter' | 'timestamp';
  value: string;
}

export interface ReadingDeliveryAttempts {
  count: number;
  lastAttemptAt?: string;
  lastErrorCode?: string;
}

export interface ReadingCapture {
  id: string;
  bookId: string;
  bookRevision: number;
  bookTitle: string;
  bookAuthor: string;
  bookTags: string[];
  destinationNotePath: string;
  originalText: string;
  captureType: ReadingCaptureType;
  source?: ReadingSource;
  locator?: ReadingCaptureLocator;
  capturedAt: string;
  receivedAt: string;
  creatorType: ReadingCaptureCreatorType;
  status: ReadingCaptureStatus;
  markdownRenderVersion: 1;
  deliveryAttempts: ReadingDeliveryAttempts;
  claimedAt?: string;
  doneAt?: string;
  updatedAt: string;
}

export interface CreateReadingBookInput {
  title: string;
  author: string;
  destinationNotePath: string;
  tags?: string[];
  defaultSource?: ReadingSource;
}

export interface UpdateReadingBookInput {
  expectedRevision: number;
  title?: string;
  author?: string;
  destinationNotePath?: string;
  tags?: string[];
  defaultSource?: ReadingSource | null;
  status?: ReadingBookStatus;
}

export interface CreateReadingCaptureInput {
  bookId: string;
  originalText: string;
  captureType: ReadingCaptureType;
  source?: ReadingSource;
  locator?: ReadingCaptureLocator;
}

export interface ReadingCaptureListFilter {
  bookId?: string;
  status?: ReadingCaptureStatus;
  limit?: number;
}

export const SIGNAL_ROLES = [
  'Father', 'Husband', 'Christian', 'Head of Department', 'Teacher',
  'Business Owner', 'Writer', 'Reader', 'Aspiring School Leader',
] as const;
export const SIGNAL_KINDS = [
  'Assessment', 'Curriculum', 'Staff', 'Intervention', 'CPD', 'Family', 'Finance', 'Technology',
] as const;
export type SignalRole = typeof SIGNAL_ROLES[number];
export type SignalKind = typeof SIGNAL_KINDS[number];
export type SignalItemType = 'task' | 'event' | 'information' | 'link';
export type SignalProcessingStatus = 'received' | 'processing' | 'complete' | 'no_items' | 'failed';
export type SignalReviewStatus = 'pending' | 'approved' | 'discarded';
export type SignalDispatchStatus = 'not_started' | 'dispatching' | 'succeeded' | 'failed';

export interface SignalCapture {
  id: string;
  rawText: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceType: 'selection' | 'paste';
  capturedAt: string;
  processingStatus: SignalProcessingStatus;
  processingError?: string;
  modelResponse?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SignalItem {
  id: string;
  captureId: string;
  type: SignalItemType;
  title: string;
  summary?: string;
  role?: SignalRole;
  project?: string;
  kind?: SignalKind;
  relevance?: string;
  dueDate?: string;
  eventStart?: string;
  eventEnd?: string;
  allDay?: boolean;
  url?: string;
  destination: 'todoist' | 'google_calendar' | 'obsidian';
  destinationFile?: string;
  suggestedLabel?: string;
  suggestedTag?: string;
  confidence?: number;
  sourceExcerpt: string;
  reviewStatus: SignalReviewStatus;
  dispatchStatus: SignalDispatchStatus;
  dispatchError?: string;
  destinationId?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSignalCaptureInput {
  rawText: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceType?: 'selection' | 'paste';
  capturedAt?: string;
}

export type UpdateSignalItemInput = Partial<Pick<SignalItem,
  'type' | 'title' | 'summary' | 'role' | 'project' | 'kind' | 'relevance' |
  'dueDate' | 'eventStart' | 'eventEnd' | 'allDay' | 'url' | 'destinationFile' |
  'suggestedLabel' | 'suggestedTag' | 'confidence'
>>;
