import {
  DashboardSnapshot,
  UserSettings,
  TodoistProjectSummary,
  TodoistProjectTask,
  Habit,
  HabitEntry,
  CreateTodoistTaskOptions,
  UpdateTodoistTaskOptions,
  MoveTodoistTaskOptions,
  CreateReadingBookInput,
  CreateReadingCaptureInput,
  ReadingBook,
  ReadingCapture,
  ReadingCaptureListFilter,
  SignalCapture,
  SignalItem,
  SignalReviewQueueEntry,
  UpdateSignalItemInput,
  UpdateReadingBookInput,
} from '../types';

export interface ApiRequestOptions extends RequestInit {
  skipAuthHandling?: boolean;
}

export class ApiClient {
  static async request<T>(url: string, options?: ApiRequestOptions): Promise<T> {
    const token = localStorage.getItem('life_site_token');
    const headers = new Headers(options?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const { skipAuthHandling, ...restOptions } = options || {};

    const mergedOptions: RequestInit = {
      ...restOptions,
      headers
    };

    const res = await fetch(url, mergedOptions);
    
    if (res.status === 401) {
      const errData = await res.clone().json().catch(() => ({}));
      if (errData && errData.todoistError) {
        throw new Error(errData.error || 'Todoist rejected the saved connection. Open Settings → Connections and enter a current Todoist API token.');
      }
      if (skipAuthHandling) {
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      localStorage.removeItem('life_site_token');
      // Clear cookie or handle unauth state
      window.dispatchEvent(new Event('unauthorized'));
      throw new Error('Unauthenticated');
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const error = new Error(errData.error || `HTTP error ${res.status}`);
      if (errData.code) {
        (error as any).code = errData.code;
      }
      throw error;
    }

    const data = await res.json();
    return data.data !== undefined ? data.data : data;
  }

  static async checkAuth(): Promise<{ authenticated: boolean; username?: string }> {
    return this.request('/api/auth/me');
  }

  static async login(username: string, password: string): Promise<{ success: boolean; username: string; token?: string }> {
    const res = await this.request<{ success: boolean; username: string; token?: string }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      skipAuthHandling: true
    });
    if (res.success && res.token) {
      localStorage.setItem('life_site_token', res.token);
    }
    return res;
  }

  static async logout(): Promise<{ success: boolean }> {
    localStorage.removeItem('life_site_token');
    return this.request('/api/auth/logout', { method: 'POST' });
  }

  static async getDashboard(context?: string): Promise<DashboardSnapshot> {
    const query = context ? `?context=${encodeURIComponent(context)}` : '';
    return this.request(`/api/dashboard${query}`);
  }

  static async getTodoistProjects(context: string): Promise<TodoistProjectSummary[]> {
    return this.request(`/api/todoist/projects?context=${encodeURIComponent(context)}`);
  }

  static async getTodoistProjectTasks(projectId: string): Promise<TodoistProjectTask[]> {
    return this.request(`/api/todoist/projects/${projectId}/tasks`);
  }

  static async getSettings(): Promise<UserSettings> {
    return this.request('/api/settings');
  }

  static async saveSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    return this.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  }

  static async getConnections(): Promise<any> {
    return this.request('/api/settings/connections');
  }

  static async saveConnections(config: any): Promise<any> {
    return this.request('/api/settings/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
  }

  static async createTodoistTask(
    content: string,
    context: 'personal' | 'professional' | 'unknown',
    options?: CreateTodoistTaskOptions
  ): Promise<any> {
    return this.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, context, ...options })
    });
  }

  static async updateTodoistTask(taskId: string, options: UpdateTodoistTaskOptions): Promise<any> {
    return this.request(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
  }

  static async moveTodoistTask(taskId: string, options: MoveTodoistTaskOptions): Promise<any> {
    return this.request(`/api/tasks/${taskId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
  }

  static async completeTodoistTask(taskId: string): Promise<any> {
    return this.request(`/api/tasks/${taskId}/complete`, {
      method: 'POST'
    });
  }

  static async addTodoistComment(taskId: string, content: string): Promise<any> {
    return this.request(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
  }

  static async createObsidianNote(content: string, mode: 'append' | 'new_note', context: 'personal' | 'professional'): Promise<any> {
    return this.request('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, mode, context })
    });
  }

  static async search(query: string, context: string): Promise<any> {
    return this.request(`/api/search?q=${encodeURIComponent(query)}&context=${encodeURIComponent(context)}`);
  }

  static async getGoogleAuthUrl(): Promise<{ url: string }> {
    return this.request('/api/auth/google/url');
  }

  static async getCalendarList(): Promise<any[]> {
    return this.request('/api/calendar/list');
  }

  static async createCalendarEvent(
    calendarId: string,
    event: { title: string; description?: string; location?: string; start: string; end: string; allDay?: boolean }
  ): Promise<any> {
    return this.request('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId, ...event })
    });
  }

  static async updateCalendarEvent(
    calendarId: string,
    eventId: string,
    event: Partial<{ title: string; description?: string; location?: string; start: string; end: string; allDay?: boolean }>
  ): Promise<any> {
    return this.request(`/api/calendar/events/${encodeURIComponent(eventId)}?calendarId=${encodeURIComponent(calendarId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
  }

  static async deleteCalendarEvent(
    calendarId: string,
    eventId: string
  ): Promise<any> {
    return this.request(`/api/calendar/events/${encodeURIComponent(eventId)}?calendarId=${encodeURIComponent(calendarId)}`, {
      method: 'DELETE'
    });
  }

  // ============================================================================
  // HABIT TRACKER API METHODS
  // ============================================================================

  static async getHabits(options?: { 
    context?: 'combined' | 'personal' | 'professional'; 
    from?: string; 
    to?: string; 
    includeArchived?: boolean; 
  }): Promise<(Habit & { entries: HabitEntry[] })[]> {
    const params = new URLSearchParams();
    if (options?.context) params.set('context', options.context);
    if (options?.from) params.set('from', options.from);
    if (options?.to) params.set('to', options.to);
    if (options?.includeArchived !== undefined) {
      params.set('includeArchived', String(options.includeArchived));
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/habits${query}`);
  }

  static async createHabit(habit: { 
    name: string; 
    context: 'personal' | 'professional'; 
    schedule: any; 
    startDate: string; 
  }): Promise<Habit> {
    return this.request('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(habit)
    });
  }

  static async updateHabit(
    habitId: string, 
    updates: Partial<{ 
      name: string; 
      context: 'personal' | 'professional'; 
      schedule: any; 
      startDate: string; 
      archived: boolean; 
    }>
  ): Promise<Habit> {
    return this.request(`/api/habits/${habitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  }

  static async updateHabitEntry(
    habitId: string, 
    date: string, 
    completed: boolean
  ): Promise<{ entry: HabitEntry | null; summary: any }> {
    return this.request(`/api/habits/${habitId}/entries/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed })
    });
  }

  static async getHabitHistory(
    habitId: string, 
    from?: string, 
    to?: string
  ): Promise<{ habit: Habit; entries: HabitEntry[] }> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/habits/${habitId}/history${query}`);
  }

  static async getReadingBooks(includeArchived = false): Promise<ReadingBook[]> {
    return this.request(
      `/api/reading/books?includeArchived=${includeArchived ? 'true' : 'false'}`,
    );
  }

  static async createReadingBook(input: CreateReadingBookInput): Promise<ReadingBook> {
    return this.request('/api/reading/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  static async updateReadingBook(
    bookId: string,
    input: UpdateReadingBookInput,
  ): Promise<ReadingBook> {
    return this.request(`/api/reading/books/${encodeURIComponent(bookId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  static async getReadingCaptures(
    filter: ReadingCaptureListFilter = {},
  ): Promise<ReadingCapture[]> {
    const params = new URLSearchParams();
    if (filter.bookId) params.set('bookId', filter.bookId);
    if (filter.status) params.set('status', filter.status);
    if (filter.limit !== undefined) params.set('limit', String(filter.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/reading/captures${query}`);
  }

  static async createReadingCapture(
    input: CreateReadingCaptureInput,
  ): Promise<{ capture: ReadingCapture }> {
    return this.request('/api/reading/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
  }

  static async getSignalItems(): Promise<SignalReviewQueueEntry[]> {
    return this.request('/api/signal/items?limit=100');
  }

  static async getSignalCapture(captureId: string): Promise<SignalCapture> {
    return this.request(`/api/signal/captures/${encodeURIComponent(captureId)}`);
  }

  static async updateSignalItem(itemId: string, input: UpdateSignalItemInput): Promise<SignalItem> {
    return this.request(`/api/signal/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  }

  static async keepSignalItem(itemId: string): Promise<SignalItem> {
    return this.request(`/api/signal/items/${encodeURIComponent(itemId)}/keep`, { method: 'POST' });
  }

  static async binSignalItem(itemId: string): Promise<SignalItem> {
    return this.request(`/api/signal/items/${encodeURIComponent(itemId)}/bin`, { method: 'POST' });
  }
}
