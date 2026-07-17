import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Calendar, 
  CheckSquare, 
  Search, 
  RefreshCw, 
  Settings, 
  LogOut, 
  Clock, 
  CloudSun, 
  Mic, 
  MicOff, 
  Paperclip, 
  Folder, 
  ExternalLink, 
  FileText, 
  Menu, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  WifiOff, 
  Info,
  CalendarDays,
  User,
  Sliders,
  Database,
  CloudLightning,
  Keyboard,
  MessageSquare,
  Loader2,
  Square,
  ChevronRight,
  Plus,
  ArrowRightLeft
} from 'lucide-react';
import { ApiClient } from './services/apiClient';
import { ObsidianClient, ObsidianNoteDetail, ObsidianApiError } from './services/obsidianClient';
import { GlobalHeader } from './components/GlobalHeader';
import { ContextTabs } from './components/ContextTabs';
import { CalendarPanel } from './components/CalendarPanel';
import { HabitPanel } from './components/HabitPanel';
import { TodoistProjectsPanel } from './components/TodoistProjectsPanel';
import { TodoistTasksWorkspace } from './components/TodoistTasksWorkspace';
import { ThoughtCatcher } from './components/ThoughtCatcher';
import { ObsidianNotesInbox } from './components/ObsidianNotesInbox';
import { SettingsWorkspace } from './components/SettingsWorkspace';
import { AppOverlays } from './components/overlays/AppOverlays';
import { useVoiceInput } from './hooks/useVoiceInput';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { EntranceHallView } from './components/layout/entranceHallTypes';
import { LifeSiteShell } from './components/layout/LifeSiteShell';
import { EntranceHallCard } from './components/layout/EntranceHallCard';
import { EntranceHallDashboard } from './components/layout/EntranceHallDashboard';
import { ObsidianErrorBox } from './components/feedback/ObsidianErrorBox';
import { 
  DashboardSnapshot, 
  UserSettings, 
  CalendarEvent, 
  TodoistTask, 
  ObsidianNote, 
  WeatherSnapshot, 
  ServiceStatus,
  TodoistProjectSummary,
  TodoistProjectTask,
  TodoistSection
} from './types';

type LifeSiteLayout = 'entrance-hall' | 'classic';

const getLayoutFromUrl = (): LifeSiteLayout => {
  if (typeof window === 'undefined') return 'entrance-hall';
  const params = new URLSearchParams(window.location.search);
  return params.get('layout') === 'classic'
    ? 'classic'
    : 'entrance-hall';
};

const DEFAULT_THOUGHT_CATCHER_FOLDER = 'Thought Catcher';

export default function App() {
  // Layout Management State (React-managed & popstate synchronized)
  const [layout, setLayout] = useState<LifeSiteLayout>(() => getLayoutFromUrl());

  // Entrance Hall Layout State
  const [entranceHallView, setEntranceHallView] = useState<EntranceHallView>('dashboard');

  // Synchronise with browser history back/forward
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      setLayout(getLayoutFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleReturnToClassic = useCallback(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('layout') === 'classic') {
        // Avoid adding a duplicate history entry if Classic is already active
        setLayout('classic');
        return;
      }
      url.searchParams.set('layout', 'classic');
      window.history.pushState({}, document.title, url.pathname + url.search);
      setLayout('classic');
    }
  }, []);

  const handleReturnToEntranceHall = useCallback(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const currentLayoutParam = url.searchParams.get('layout');
      const isAlreadyEntranceHall = currentLayoutParam !== 'classic';
      if (isAlreadyEntranceHall && layout === 'entrance-hall') {
        // Avoid duplicate history entry
        setLayout('entrance-hall');
        return;
      }
      url.searchParams.delete('layout');
      window.history.pushState({}, document.title, url.pathname + (url.search ? url.search : ''));
      setLayout('entrance-hall');
    }
  }, [layout]);

  // Authentication states
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Refs to handle current authentication status and request-generation/epoch
  const authStatusRef = useRef<boolean>(false);
  const authGenerationRef = useRef<number>(0);
  const searchGenerationRef = useRef<number>(0);
  const isAuthGenerationCurrent = useCallback((generation: number) => (
    authStatusRef.current && authGenerationRef.current === generation
  ), []);

  // Sync authStatusRef.current with state isAuthenticated
  useEffect(() => {
    authStatusRef.current = isAuthenticated;
  }, [isAuthenticated]);
  const [username, setUsername] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // App settings & Theme
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');

  // Dashboard state
  const [dashboardData, setDashboardData] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Active Context Tab
  const [activeTab, setActiveTab] = useState<'combined' | 'personal' | 'professional'>('combined');

  // Todoist Projects progress panel states
  const [todoistProjects, setTodoistProjects] = useState<TodoistProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState<boolean>(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [selectedMobileSectionId, setSelectedMobileSectionId] = useState<string | null>(null);

  // Lazy-loaded project tasks states
  const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, boolean>>({});
  const [projectTasks, setProjectTasks] = useState<Record<string, TodoistProjectTask[]>>({});
  const [loadingProjectTasks, setLoadingProjectTasks] = useState<Record<string, boolean>>({});
  const [projectTasksError, setProjectTasksError] = useState<Record<string, string>>({});

  // Offline status
  const [isOffline, setIsOffline] = useState(!window.navigator.onLine);

  // Calendar view preferences
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('day');
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(new Date());

  // Input states (Inboxes)
  const [todoistInput, setTodoistInput] = useState('');
  const [todoistContext, setTodoistContext] = useState<'personal' | 'professional'>('personal');
  const [todoistLoading, setTodoistLoading] = useState(false);
  const [todoistSuccess, setTodoistSuccess] = useState(false);
  const [todoistError, setTodoistError] = useState<string | null>(null);

  // Today's Task Add UI State
  const [isAddingTodayTask, setIsAddingTodayTask] = useState(false);
  const [todayTaskTitle, setTodayTaskTitle] = useState('');
  const [todayTaskDesc, setTodayTaskDesc] = useState('');
  const [todayTaskPriority, setTodayTaskPriority] = useState<number>(1);
  const [todayTaskContext, setTodayTaskContext] = useState<'personal' | 'professional'>('personal');
  const [todayTaskLoading, setTodayTaskLoading] = useState(false);
  const [todayTaskError, setTodayTaskError] = useState<string | null>(null);

  // Board Column Task Add UI State
  const [addingTaskForSectionId, setAddingTaskForSectionId] = useState<string | null>(null);
  const [boardTaskTitle, setBoardTaskTitle] = useState('');
  const [boardTaskDesc, setBoardTaskDesc] = useState('');
  const [boardTaskPriority, setBoardTaskPriority] = useState<number>(1);
  const [boardTaskContext, setBoardTaskContext] = useState<'personal' | 'professional'>('personal');
  const [boardTaskLoading, setBoardTaskLoading] = useState(false);
  const [boardTaskError, setBoardTaskError] = useState<string | null>(null);

  const [obsidianInput, setObsidianInput] = useState(() => {
    try {
      return localStorage.getItem('life_site_mobile_draft_content') || '';
    } catch {
      return '';
    }
  });
  const [obsidianTitle, setObsidianTitle] = useState(() => {
    try {
      return localStorage.getItem('life_site_mobile_draft_title') || '';
    } catch {
      return '';
    }
  });
  const [obsidianMode, setObsidianMode] = useState<'append' | 'new_note'>(() => {
    try {
      return (localStorage.getItem('life_site_mobile_draft_mode') as 'append' | 'new_note') || 'append';
    } catch {
      return 'append';
    }
  });
  const [obsidianContext, setObsidianContext] = useState<'personal' | 'professional'>(() => {
    try {
      return (localStorage.getItem('life_site_mobile_draft_context') as 'personal' | 'professional') || 'personal';
    } catch {
      return 'personal';
    }
  });
  const [obsidianLoading, setObsidianLoading] = useState(false);
  const [obsidianSuccess, setObsidianSuccess] = useState(false);
  const [obsidianError, setObsidianError] = useState<string | null>(null);

  // Voice Inputs
  const {
    isListening: isListeningTodoist,
    isSupported: isVoiceSupported,
    toggleListening: toggleVoiceTodoist,
    stopListening: stopVoiceTodoist
  } = useVoiceInput((text) => setTodoistInput(prev => (prev ? prev + ' ' + text : text)));

  const {
    isListening: isListeningObsidian,
    toggleListening: toggleVoiceObsidian,
    stopListening: stopVoiceObsidian
  } = useVoiceInput((text) => setObsidianInput(prev => (prev ? prev + ' \n' + text : text)));

  // Global search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ notes: ObsidianNote[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Obsidian Local Connection states
  const [rememberObsidian, setRememberObsidian] = useState(() => {
    return localStorage.getItem('remember_obsidian') === 'true';
  });

  const [obsidianUrl, setObsidianUrl] = useState(() => {
    const sessUrl = sessionStorage.getItem('obsidian_api_url');
    if (sessUrl) return sessUrl;
    const isRemembered = localStorage.getItem('remember_obsidian') === 'true';
    if (isRemembered) {
      const localUrl = localStorage.getItem('obsidian_api_url');
      if (localUrl) return localUrl;
    }
    return 'https://127.0.0.1:27124';
  });

  const [obsidianApiKey, setObsidianApiKey] = useState(() => {
    const sessKey = sessionStorage.getItem('obsidian_api_key');
    if (sessKey) return sessKey;
    const isRemembered = localStorage.getItem('remember_obsidian') === 'true';
    if (isRemembered) {
      const localKey = localStorage.getItem('obsidian_api_key');
      if (localKey) return localKey;
    }
    return '';
  });

  const [obsidianApiKeyInput, setObsidianApiKeyInput] = useState('');
  const [obsidianTestStatus, setObsidianTestStatus] = useState<{ success: boolean | null; message: string; loading: boolean }>({
    success: null,
    message: '',
    loading: false
  });

  // Obsidian Recent Notes and Inline Editor States
  const [recentNotes, setRecentNotes] = useState<ObsidianNoteDetail[]>([]);
  const [recentNotesErrorDetails, setRecentNotesErrorDetails] = useState<ObsidianApiError | null>(null);
  const [obsidianErrorDetails, setObsidianErrorDetails] = useState<ObsidianApiError | null>(null);
  const [saveNoteErrorDetails, setSaveNoteErrorDetails] = useState<ObsidianApiError | null>(null);
  const [appendNoteErrorDetails, setAppendNoteErrorDetails] = useState<ObsidianApiError | null>(null);
  const [recentNotesLoading, setRecentNotesLoading] = useState(false);
  const [recentNotesError, setRecentNotesError] = useState<string | null>(null);

  const [selectedRecentNote, setSelectedRecentNote] = useState<ObsidianNoteDetail | null>(null);
  const [editedNoteContent, setEditedNoteContent] = useState('');
  const [appendNoteContent, setAppendNoteContent] = useState('');
  const [isSavingEditedNote, setIsSavingEditedNote] = useState(false);
  const [isAppendingNote, setIsAppendingNote] = useState(false);
  const [saveNoteSuccess, setSaveNoteSuccess] = useState<boolean | null>(null);
  const [saveNoteError, setSaveNoteError] = useState<string | null>(null);
  const [appendNoteSuccess, setAppendNoteSuccess] = useState<boolean | null>(null);
  const [appendNoteError, setAppendNoteError] = useState<string | null>(null);

  // Obsidian connection mode states
  const [mobileHandoffStatus, setMobileHandoffStatus] = useState<'available' | 'failed' | 'copied' | 'success'>('available');
  const [mobileObsidianSearchQuery, setMobileObsidianSearchQuery] = useState('');

  const getActiveObsidianMode = useCallback((): 'desktop' | 'mobile' => {
    const modeSetting = settings?.obsidian?.connectionMode || 'auto';
    if (modeSetting === 'mobile') return 'mobile';
    if (modeSetting === 'desktop') return 'desktop';
    
    // Automatic detection: viewport width < 768 and coarse pointer
    const isNarrow = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
    const isCoarse = typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)').matches : false;
    return (isNarrow && isCoarse) ? 'mobile' : 'desktop';
  }, [settings?.obsidian?.connectionMode]);

  const getObsidianStatusInfo = useCallback(() => {
    if (getActiveObsidianMode() === 'mobile') {
      return {
        text: 'Mobile Handoff Active',
        color: 'border-purple-300 bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-300 dark:border-purple-800/40'
      };
    }
    
    if (!obsidianApiKey) {
      return {
        text: 'Unconfigured',
        color: 'border-gray-300 bg-gray-50 text-gray-500 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-700'
      };
    }
    
    if (obsidianTestStatus.success === true) {
      return {
        text: 'Connected',
        color: 'border-green-300 bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-300 dark:border-green-800'
      };
    }
    
    if (obsidianTestStatus.success === false) {
      return {
        text: 'Connection Error',
        color: 'border-red-300 bg-[#ffdad6] text-[#ba1a1a] dark:bg-[#ffdad6]/20 dark:text-red-300 dark:border-red-800'
      };
    }
    
    return {
      text: 'Configured',
      color: 'border-blue-300 bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-800'
    };
  }, [getActiveObsidianMode, obsidianApiKey, obsidianTestStatus.success]);

  const cleanApiKey = (key: string): string => {
    if (!key) return '';
    let cleaned = key.trim().replace(/\r?\n|\r/g, '');
    if (cleaned.toLowerCase().startsWith('bearer ')) {
      cleaned = cleaned.substring(7).trim();
    }
    return cleaned;
  };

  const handleRememberObsidianToggle = (checked: boolean) => {
    setRememberObsidian(checked);
    localStorage.setItem('remember_obsidian', String(checked));
    if (checked) {
      if (obsidianUrl) {
        localStorage.setItem('obsidian_api_url', obsidianUrl);
      }
    } else {
      localStorage.removeItem('obsidian_api_key');
      localStorage.removeItem('obsidian_api_url');
    }
  };

  const handleForgetObsidian = () => {
    localStorage.removeItem('obsidian_api_key');
    sessionStorage.removeItem('obsidian_api_key');
    setObsidianApiKey('');
    setObsidianApiKeyInput('');
    setObsidianTestStatus({ success: null, message: '', loading: false });
  };

  const getObsidianErrorMessage = (err: any, folderName: string, isFolderRequest = false): string => {
    if (err instanceof ObsidianApiError) {
      if (err.status === 401 || err.status === 403) {
        return "Obsidian is running, but the API key was rejected. Enter the current API key in Settings.";
      }
      if (err.status === 404) {
        const url = err.url || '';
        const cleanUrl = url.replace(/\?.*$/, '');
        const isActuallyFolder = isFolderRequest || cleanUrl.endsWith('/') || !cleanUrl.toLowerCase().endsWith('.md');
        if (isActuallyFolder) {
          return `Obsidian is connected, but the folder ‘${folderName}’ was not found.`;
        } else {
          return "The note could not be found at its expected Obsidian path.";
        }
      }
      if (err.status) {
        return `Obsidian returned status [${err.status}].`;
      }
      // Network failure or browser TLS/certificate error
      return "Your browser cannot yet connect securely to Obsidian. Open the local Obsidian connection page, accept the certificate, and try again. Alternatively, Obsidian’s local service is not responding. Open Obsidian and confirm that the Local REST API plugin is enabled.";
    }
    return err.message || "An unexpected error occurred.";
  };

  const loadRecentNotes = useCallback(async () => {
    const activeMode = getActiveObsidianMode();
    if (activeMode === 'mobile') {
      setRecentNotesLoading(false);
      setRecentNotesError(null);
      setRecentNotesErrorDetails(null);
      setRecentNotes([]);
      return;
    }

    if (!obsidianUrl || !obsidianApiKey) {
      setRecentNotesError('Obsidian connection not configured. Please enter your API Key in the settings panel.');
      setRecentNotes([]);
      return;
    }
    const currentGen = authGenerationRef.current;
    setRecentNotesLoading(true);
    setRecentNotesError(null);
    setRecentNotesErrorDetails(null);
    const folder = settings?.obsidian?.inboxFolder || 'Fleeting Notes';
    try {
      const notes = await ObsidianClient.getRecentNotes(obsidianUrl, obsidianApiKey, folder);
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setRecentNotes(notes);
      }
    } catch (err: any) {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        console.error('Error fetching recent notes:', err);
        const errMsg = getObsidianErrorMessage(err, folder, true);
        setRecentNotesError(errMsg);
        setRecentNotesErrorDetails(err instanceof ObsidianApiError ? {
          method: err.method,
          url: err.url,
          status: err.status,
          responseBody: err.responseBody,
          location: 'browser'
        } : null);
        setRecentNotes([]);
      }
    } finally {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setRecentNotesLoading(false);
      }
    }
  }, [obsidianUrl, obsidianApiKey, settings, getActiveObsidianMode]);

  useEffect(() => {
    if (isAuthenticated) {
      loadRecentNotes();
    }
  }, [isAuthenticated, loadRecentNotes]);

  // Mobile draft autosave
  useEffect(() => {
    const activeMode = getActiveObsidianMode();
    if (activeMode !== 'mobile') return;

    const handler = setTimeout(() => {
      try {
        localStorage.setItem('life_site_mobile_draft_title', obsidianTitle);
        localStorage.setItem('life_site_mobile_draft_content', obsidianInput);
        localStorage.setItem('life_site_mobile_draft_context', obsidianContext);
        localStorage.setItem('life_site_mobile_draft_mode', obsidianMode);
      } catch (err) {
        console.error('Local storage draft write failed:', err);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [obsidianTitle, obsidianInput, obsidianContext, obsidianMode, getActiveObsidianMode]);

  const handleOpenRecentNote = async (note: ObsidianNoteDetail) => {
    setSelectedRecentNote(null);
    setEditedNoteContent('');
    setAppendNoteContent('');
    setSaveNoteSuccess(null);
    setSaveNoteError(null);
    setSaveNoteErrorDetails(null);
    setAppendNoteSuccess(null);
    setAppendNoteError(null);
    setAppendNoteErrorDetails(null);

    const currentGen = authGenerationRef.current;
    try {
      const fileData = await ObsidianClient.readFile(obsidianUrl, obsidianApiKey, note.path);
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setSelectedRecentNote({
          ...note,
          content: fileData.content,
          modifiedAt: fileData.lastModified
        });
        setEditedNoteContent(fileData.content);
      }
    } catch (err: any) {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        console.error('Error opening note:', err);
        const folder = settings?.obsidian?.inboxFolder || 'Fleeting Notes';
        const errMsg = getObsidianErrorMessage(err, folder, false);
        setRecentNotesError(errMsg);
        setRecentNotesErrorDetails(err instanceof ObsidianApiError ? {
          method: err.method,
          url: err.url,
          status: err.status,
          responseBody: err.responseBody,
          location: 'browser'
        } : null);
      }
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedRecentNote) return;
    const currentGen = authGenerationRef.current;
    setIsSavingEditedNote(true);
    setSaveNoteSuccess(null);
    setSaveNoteError(null);
    setSaveNoteErrorDetails(null);

    const folder = settings?.obsidian?.inboxFolder || 'Fleeting Notes';

    try {
      const exists = await ObsidianClient.checkFileExists(obsidianUrl, obsidianApiKey, selectedRecentNote.path);
      if (!exists) {
        throw new Error('This note no longer exists in your Obsidian vault.');
      }

      await ObsidianClient.replaceFile(obsidianUrl, obsidianApiKey, selectedRecentNote.path, editedNoteContent);
      
      const updatedNote = {
        ...selectedRecentNote,
        content: editedNoteContent,
        modifiedAt: new Date().toISOString(),
        preview: ObsidianClient.cleanPreviewText(editedNoteContent)
      };

      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setSaveNoteSuccess(true);
        setSelectedRecentNote(updatedNote);
        await loadRecentNotes();
      }
    } catch (err: any) {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        console.error('Error saving note:', err);
        const errMsg = getObsidianErrorMessage(err, folder, false);
        setSaveNoteError(errMsg);
        setSaveNoteErrorDetails(err instanceof ObsidianApiError ? {
          method: err.method,
          url: err.url,
          status: err.status,
          responseBody: err.responseBody,
          location: 'browser'
        } : null);
      }
    } finally {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setIsSavingEditedNote(false);
      }
    }
  };

  const handleAppendToNote = async () => {
    if (!selectedRecentNote || !appendNoteContent.trim()) return;
    const currentGen = authGenerationRef.current;
    setIsAppendingNote(true);
    setAppendNoteSuccess(null);
    setAppendNoteError(null);
    setAppendNoteErrorDetails(null);

    const folder = settings?.obsidian?.inboxFolder || 'Fleeting Notes';

    try {
      const exists = await ObsidianClient.checkFileExists(obsidianUrl, obsidianApiKey, selectedRecentNote.path);
      if (!exists) {
        throw new Error('This note no longer exists in your Obsidian vault.');
      }

      const appendText = `\n\n${appendNoteContent.trim()}`;
      await ObsidianClient.appendToFile(obsidianUrl, obsidianApiKey, selectedRecentNote.path, appendText);

      const fileData = await ObsidianClient.readFile(obsidianUrl, obsidianApiKey, selectedRecentNote.path);
      
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setAppendNoteSuccess(true);
        setAppendNoteContent('');
        setSelectedRecentNote({
          ...selectedRecentNote,
          content: fileData.content,
          modifiedAt: fileData.lastModified,
          preview: ObsidianClient.cleanPreviewText(fileData.content)
        });
        await loadRecentNotes();
        setTimeout(() => {
          if (authStatusRef.current && authGenerationRef.current === currentGen) {
            setAppendNoteSuccess(null);
          }
        }, 3000);
      }
    } catch (err: any) {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        console.error('Error appending to note:', err);
        const errMsg = getObsidianErrorMessage(err, folder, false);
        setAppendNoteError(errMsg);
        setAppendNoteErrorDetails(err instanceof ObsidianApiError ? {
          method: err.method,
          url: err.url,
          status: err.status,
          responseBody: err.responseBody,
          location: 'browser'
        } : null);
      }
    } finally {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setIsAppendingNote(false);
      }
    }
  };

  const handleObsidianUrlChange = (val: string) => {
    const cleanUrl = ObsidianClient.cleanBaseUrl(val);
    setObsidianUrl(cleanUrl);
    sessionStorage.setItem('obsidian_api_url', cleanUrl);
    if (localStorage.getItem('remember_obsidian') === 'true') {
      localStorage.setItem('obsidian_api_url', cleanUrl);
    }
  };

  const handleObsidianApiKeyChange = (val: string) => {
    setObsidianApiKeyInput(val);
    const cleaned = cleanApiKey(val);
    if (cleaned) {
      setObsidianApiKey(cleaned);
      sessionStorage.setItem('obsidian_api_key', cleaned);
    }
  };

  const handleTestObsidianConnection = async () => {
    setObsidianTestStatus({ success: null, message: '', loading: true });
    
    const baseUrl = ObsidianClient.cleanBaseUrl(obsidianUrl);
    setObsidianUrl(baseUrl);
    sessionStorage.setItem('obsidian_api_url', baseUrl);

    const keyToTest = cleanApiKey(obsidianApiKeyInput || obsidianApiKey);
    if (!keyToTest) {
      setObsidianTestStatus({
        success: false,
        message: 'API Key is missing. Please enter your Local REST API key/password.',
        loading: false
      });
      return;
    }

    if (keyToTest === 'configured') {
      setObsidianTestStatus({
        success: false,
        message: 'Error: "configured" is not a valid API key.',
        loading: false
      });
      return;
    }

    // Check 1: local service availability (No auth needed)
    let isReachable = false;
    try {
      await fetch(`${baseUrl}/`, { method: 'GET' });
      isReachable = true;
    } catch (err) {
      console.error('Health check failed:', err);
    }

    const isInsideIframe = (() => {
      try {
        return window.self !== window.top;
      } catch (e) {
        return true;
      }
    })();

    if (!isReachable) {
      let iframeWarning = '';
      if (isInsideIframe) {
        iframeWarning = '\n\n⚠️ Note: You are currently inside an iframe. Browsers often block local REST requests from within frames due to security restrictions (such as Mixed Content or secure origin policies). Please click "Open Life Site in a new tab" to connect successfully.';
      }
      setObsidianTestStatus({
        success: false,
        message: `Check 1 Failed: Local service is unreachable.\n\n` +
                 `Possible causes:\n` +
                 `• Obsidian desktop is closed.\n` +
                 `• The "Local REST API" plugin is not enabled/running in Obsidian.\n` +
                 `• The local HTTPS certificate is not trusted by your browser.\n` +
                 `• Browser or iframe blocked local access.${iframeWarning}\n\n` +
                 `Troubleshooting Steps:\n` +
                 `1. Confirm Obsidian desktop is open.\n` +
                 `2. Go to Obsidian Settings -> Local REST API and make sure it is active.\n` +
                 `3. Click the "Trust Obsidian Connection" button below to open https://127.0.0.1:27124/ in a new tab, accept the self-signed certificate, then try testing again here.`,
        loading: false
      });
      return;
    }

    // Check 2: authentication & Check 3: Folder Existence
    try {
      const response = await fetch(`${baseUrl}/vault/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${keyToTest}`,
          'Accept': 'application/json'
        }
      });

      if (response.status === 200) {
        // Auth succeeded. Now verify Fleeting Notes folder exists
        const folder = settings?.obsidian?.inboxFolder || 'Fleeting Notes';
        const cleanFolder = ObsidianClient.normalizeVaultPath(folder);
        const encodedFolder = ObsidianClient.encodeVaultPath(cleanFolder ? `${cleanFolder}/` : '');
        
        try {
          const folderResponse = await fetch(`${baseUrl}/vault/${encodedFolder}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${keyToTest}`,
              'Accept': 'application/json'
            }
          });

          if (folderResponse.status === 200) {
            sessionStorage.setItem('obsidian_api_key', keyToTest);
            setObsidianApiKey(keyToTest);
            setObsidianApiKeyInput(''); // Clear input after successful save

            if (rememberObsidian) {
              localStorage.setItem('obsidian_api_key', keyToTest);
              localStorage.setItem('obsidian_api_url', baseUrl);
            }
            
            setObsidianTestStatus({
              success: true,
              message: 'Connection successful!\n• Local service is reachable.\n• Authentication succeeded.\n• Fleeting Notes folder found.\n• Saved secure connection.',
              loading: false
            });
            loadRecentNotes();
          } else if (folderResponse.status === 404) {
            sessionStorage.setItem('obsidian_api_key', keyToTest);
            setObsidianApiKey(keyToTest);
            setObsidianApiKeyInput('');

            if (rememberObsidian) {
              localStorage.setItem('obsidian_api_key', keyToTest);
              localStorage.setItem('obsidian_api_url', baseUrl);
            }
            
            setObsidianTestStatus({
              success: true, // Reported as connection success but warning
              message: `Connection successful, but the configured Fleeting Notes folder "${folder}" was not found (Status 404).\n` +
                       `• Local service is reachable.\n` +
                       `• Authentication succeeded.\n` +
                       `⚠️ Please create the folder "${folder}" in Obsidian or update the Inbox Folder in Settings.`,
              loading: false
            });
            loadRecentNotes();
          } else {
            setObsidianTestStatus({
              success: false,
              message: `Check 2 Failed: Auth succeeded, but checking folder "${folder}" returned unexpected status: ${folderResponse.status}`,
              loading: false
            });
          }
        } catch (folderErr: any) {
          setObsidianTestStatus({
            success: false,
            message: `Check 2 Failed: Auth succeeded, but checking folder "${folder}" failed due to network request error: ${folderErr.message || folderErr}`,
            loading: false
          });
        }
      } else if (response.status === 401 || response.status === 403) {
        setObsidianTestStatus({
          success: false,
          message: `Check 2 Failed: API key rejected with status ${response.status} (Unauthorized).\nObsidian is running, but the API key was rejected. Enter the current API key in Settings. (The word Bearer must never be stored as part of the API key.)`,
          loading: false
        });
      } else if (response.status === 404) {
        setObsidianTestStatus({
          success: false,
          message: 'Check 2 Failed: Endpoint not found (Status 404).\nThe URL or endpoint structure is wrong.',
          loading: false
        });
      } else {
        setObsidianTestStatus({
          success: false,
          message: `Check 2 Failed: Obsidian returned unexpected HTTP response status ${response.status}.`,
          loading: false
        });
      }
    } catch (err: any) {
      console.error('Auth check network error:', err);
      setObsidianTestStatus({
        success: false,
        message: 'Check 2 Failed: Network request failed or browser cannot reach the local service securely.\n' +
                 'This usually means the local certificate is not trusted, or the connection was blocked by the browser/iframe.\n' +
                 'Please click "Trust Obsidian connection" below to open the certificate page, accept it, and try again.',
        loading: false
      });
    }
  };

  // Collapsed sections
  const [completedTasksExpanded, setCompletedTasksExpanded] = useState(false);

  // Todoist task interaction states
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(new Set());
  const [justCompletedTaskIds, setJustCompletedTaskIds] = useState<Set<string>>(new Set());
  const [taskErrors, setTaskErrors] = useState<Record<string, string>>({});
  const [activeCommentTaskId, setActiveCommentTaskId] = useState<string | null>(null);
  const [taskComments, setTaskComments] = useState<Record<string, string>>({});
  const [commentSavingTaskIds, setCommentSavingTaskIds] = useState<Set<string>>(new Set());
  const [commentSuccessMessages, setCommentSuccessMessages] = useState<Record<string, string>>({});
  const [confirmingCompleteTask, setConfirmingCompleteTask] = useState<TodoistTask | null>(null);

  // Modals / Overlay states
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedTask, setSelectedTask] = useState<TodoistTask | null>(null);
  const [movingTaskMenu, setMovingTaskMenu] = useState<TodoistTask | null>(null);

  // Drag and Drop State variables
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [movingTaskIds, setMovingTaskIds] = useState<Set<string>>(new Set());
  const [canDrag, setCanDrag] = useState(false);

  useEffect(() => {
    // Disable drag behavior on touch or coarse-pointer devices
    const hasCoarse = window.matchMedia('(pointer: coarse)').matches;
    setCanDrag(!hasCoarse);
  }, []);

  const [selectedNote, setSelectedNote] = useState<ObsidianNote | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showStartupSummary, setShowStartupSummary] = useState(false);
  const [startupStats, setStartupStats] = useState<{
    eventsToday: number;
    tasksDue: number;
    overdueTasks: number;
    favModifiedSince: number;
  } | null>(null);

  // Settings active section
  const [settingsSection, setSettingsSection] = useState<'general' | 'notes' | 'tasks' | 'calendar' | 'weather' | 'connections' | 'shortcuts'>('general');
  const [settingsEditState, setSettingsEditState] = useState<UserSettings | null>(null);
  const [connectionsStatus, setConnectionsStatus] = useState<any>(null);
  const [secretsForm, setSecretsForm] = useState({
    todoistToken: '',
    googleClientId: '',
    googleClientSecret: ''
  });
  const [saveSettingsSuccess, setSaveSettingsSuccess] = useState(false);

  // Ref hooks for focusing inputs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const obsidianTitleRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);
  const tasksInputRef = useRef<HTMLInputElement>(null);

  // Clock state
  const [currentTime, setCurrentTime] = useState(new Date());

  // Calendar list state
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([]);
  const [googleCalendarsLoading, setGoogleCalendarsLoading] = useState(false);
  const [googleCalendarsError, setGoogleCalendarsError] = useState<string | null>(null);
  const [showCalendarsDropdown, setShowCalendarsDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calendar Event Create Form State
  const [showAddEventForm, setShowAddEventForm] = useState(false);
  const [addEventFormInitialDate, setAddEventFormInitialDate] = useState<Date | undefined>(undefined);
  const [addEventFormInitialStartHour, setAddEventFormInitialStartHour] = useState<string | undefined>(undefined);

  const clearSearch = useCallback(() => {
    searchGenerationRef.current += 1;
    setSearchQuery('');
    setSearchResults(null);
    setIsSearching(false);
  }, []);

  const clearProtectedState = useCallback(() => {
    // 1. Immediately mark the current session as invalid locally
    authStatusRef.current = false;
    authGenerationRef.current += 1;

    // 2. Invalidate any active search request
    searchGenerationRef.current += 1;

    // 3. Reset Todoist request-lock refs/markers
    lastFetchedProjectsContextRef.current = null;
    inFlightTodoistProjectsContextRef.current = null;
    loadedTodoistProjectsContextRef.current = null;
    todoistProjectsRequestGenerationRef.current += 1;

    // 4. Clear/close protected data and UI state
    setIsAuthenticated(false);
    setUsername('');
    setDashboardData(null);
    setSettings(null);
    setTodoistProjects([]);
    setProjectTasks({});
    setRecentNotes([]);
    setSelectedRecentNote(null);
    setEditedNoteContent('');
    setAppendNoteContent('');
    setSearchQuery('');
    setSearchResults(null);
    setSelectedEvent(null);
    setSelectedTask(null);
    setSelectedNote(null);
    setMovingTaskMenu(null);
    setConfirmingCompleteTask(null);
    setConnectionsStatus(null);
    setSettingsEditState(null);
    setRecentNotesLoading(false);
    setRecentNotesError(null);
    setIsSearching(false);
    setShowSettings(false);
    setShowStartupSummary(false);
    setStartupStats(null);
    setShowAddEventForm(false);

    // Reset other loading / error / comments states
    setRefreshError(null);
    setProjectsError(null);
    setLoadingProjects(false);
    setRefreshing(false);
    setLoadingProjectTasks({});
    setProjectTasksError({});
    setGoogleCalendars([]);
    setGoogleCalendarsError(null);
    setGoogleCalendarsLoading(false);
    setTaskErrors({});
    setTaskComments({});
    setCommentSuccessMessages({});
    setCompletingTaskIds(new Set());
    setJustCompletedTaskIds(new Set());
    setMovingTaskIds(new Set());
    setCommentSavingTaskIds(new Set());
    setActiveCommentTaskId(null);
    setTodoistInput('');
    setTodoistLoading(false);
    setTodoistSuccess(false);
    setTodoistError(null);
    setIsAddingTodayTask(false);
    setTodayTaskTitle('');
    setTodayTaskDesc('');
    setTodayTaskLoading(false);
    setTodayTaskError(null);
    setAddingTaskForSectionId(null);
    setBoardTaskTitle('');
    setBoardTaskDesc('');
    setBoardTaskLoading(false);
    setBoardTaskError(null);
    setObsidianInput('');
    setObsidianTitle('');
    setObsidianLoading(false);
    setObsidianSuccess(false);
    setObsidianError(null);
    setIsSavingEditedNote(false);
    setIsAppendingNote(false);
    setSecretsForm({ todoistToken: '', googleClientId: '', googleClientSecret: '' });
    setObsidianErrorDetails(null);
    setRecentNotesErrorDetails(null);
    setSaveNoteErrorDetails(null);
    setAppendNoteErrorDetails(null);
    
    // Clear any local cache
    localStorage.removeItem('life_site_snapshot');
  }, []);

  const activeSelectedCalendarIds = useMemo(() => {
    if (!settings) return [];
    return settings.calendar?.selectedCalendarIdsByContext?.[activeTab]
      ?? (activeTab === 'combined' ? (settings.calendar?.selectedCalendarIds || ['primary']) : (activeTab === 'personal' ? ['primary'] : []));
  }, [settings, activeTab]);

  const loadCalendarsList = async () => {
    if (isOffline || !authStatusRef.current) return;
    const currentGen = authGenerationRef.current;
    setGoogleCalendarsLoading(true);
    setGoogleCalendarsError(null);
    try {
      const list = await ApiClient.getCalendarList();
      const conn = await ApiClient.getConnections();
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setGoogleCalendars(list || []);
        setConnectionsStatus(conn);
      }
    } catch (err: any) {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        console.error('Failed to load Google Calendar list:', err);
        setGoogleCalendarsError(err.message || 'Failed to load Google Calendar list.');
      }
    } finally {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setGoogleCalendarsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadCalendarsList();
    }
  }, [isAuthenticated]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCalendarsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleToggleCalendar = async (calendarId: string) => {
    if (!settings) return;

    const byContext = settings.calendar?.selectedCalendarIdsByContext
      ? { ...settings.calendar.selectedCalendarIdsByContext }
      : { combined: [...(settings.calendar?.selectedCalendarIds || ['primary'])], personal: ['primary'], professional: [] };

    if (!byContext.combined) byContext.combined = [...(settings.calendar?.selectedCalendarIds || ['primary'])];
    if (!byContext.personal) byContext.personal = ['primary'];
    if (!byContext.professional) byContext.professional = [];

    const currentSelection = [...(byContext[activeTab] || [])];
    const index = currentSelection.indexOf(calendarId);
    if (index > -1) {
      currentSelection.splice(index, 1);
    } else {
      currentSelection.push(calendarId);
    }

    byContext[activeTab] = currentSelection;

    const newSelectedCalendarIds = activeTab === 'combined' ? currentSelection : (settings.calendar?.selectedCalendarIds || ['primary']);

    const updatedSettings: UserSettings = {
      ...settings,
      calendar: {
        ...settings.calendar,
        selectedCalendarIds: newSelectedCalendarIds,
        selectedCalendarIdsByContext: byContext
      }
    };

    setSettings(updatedSettings);
    if (dashboardData) {
      setDashboardData({
        ...dashboardData,
        settings: updatedSettings
      });
    }

    try {
      await ApiClient.saveSettings(updatedSettings);
      await triggerRefresh();
    } catch (e: any) {
      console.error('Failed to save calendar selection:', e);
    }
  };

  const handleSelectAllCalendars = async () => {
    if (!settings) return;

    const byContext = settings.calendar?.selectedCalendarIdsByContext
      ? { ...settings.calendar.selectedCalendarIdsByContext }
      : { combined: [...(settings.calendar?.selectedCalendarIds || ['primary'])], personal: ['primary'], professional: [] };

    if (!byContext.combined) byContext.combined = [...(settings.calendar?.selectedCalendarIds || ['primary'])];
    if (!byContext.personal) byContext.personal = ['primary'];
    if (!byContext.professional) byContext.professional = [];

    const allIds = googleCalendars.map(c => c.id);
    byContext[activeTab] = allIds;

    const newSelectedCalendarIds = activeTab === 'combined' ? allIds : (settings.calendar?.selectedCalendarIds || ['primary']);

    const updatedSettings: UserSettings = {
      ...settings,
      calendar: {
        ...settings.calendar,
        selectedCalendarIds: newSelectedCalendarIds,
        selectedCalendarIdsByContext: byContext
      }
    };

    setSettings(updatedSettings);
    if (dashboardData) {
      setDashboardData({
        ...dashboardData,
        settings: updatedSettings
      });
    }

    try {
      await ApiClient.saveSettings(updatedSettings);
      await triggerRefresh();
    } catch (e: any) {
      console.error('Failed to save calendar selection:', e);
    }
  };

  const handleClearAllCalendars = async () => {
    if (!settings) return;

    const byContext = settings.calendar?.selectedCalendarIdsByContext
      ? { ...settings.calendar.selectedCalendarIdsByContext }
      : { combined: [...(settings.calendar?.selectedCalendarIds || ['primary'])], personal: ['primary'], professional: [] };

    if (!byContext.combined) byContext.combined = [...(settings.calendar?.selectedCalendarIds || ['primary'])];
    if (!byContext.personal) byContext.personal = ['primary'];
    if (!byContext.professional) byContext.professional = [];

    byContext[activeTab] = [];

    const newSelectedCalendarIds = activeTab === 'combined' ? [] : (settings.calendar?.selectedCalendarIds || ['primary']);

    const updatedSettings: UserSettings = {
      ...settings,
      calendar: {
        ...settings.calendar,
        selectedCalendarIds: newSelectedCalendarIds,
        selectedCalendarIdsByContext: byContext
      }
    };

    setSettings(updatedSettings);
    if (dashboardData) {
      setDashboardData({
        ...dashboardData,
        settings: updatedSettings
      });
    }

    try {
      await ApiClient.saveSettings(updatedSettings);
      await triggerRefresh();
    } catch (e: any) {
      console.error('Failed to save calendar selection:', e);
    }
  };

  // -------------------------------------------------------------
  // Initialization & Boot
  // -------------------------------------------------------------

  useEffect(() => {
    // Standard offline/online event listeners
    const handleOnline = () => {
      setIsOffline(false);
      triggerRefresh();
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Watch for unauthorized event to redirect immediately
    const handleUnauthorized = () => {
      clearProtectedState();
      setLoading(false);
    };
    window.addEventListener('unauthorized', handleUnauthorized);

    // Check credentials and boot
    checkAuthAndLoad();

    // Digital Clock interval
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('unauthorized', handleUnauthorized);
      clearInterval(clockInterval);
    };
  }, []);

  // Sync theme
  useEffect(() => {
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [themeMode]);

  // Handle URL Query parameters (e.g. Google Calendar OAuth connection callback redirects)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('google_connected') === 'true') {
      // Show settings page on connections tab for confirmation
      setShowSettings(true);
      setSettingsSection('connections');
      // Clean query parameter from URL bar cleanly
      window.history.replaceState({}, document.title, "/");
      triggerRefresh();
    }
  }, []);

  // -------------------------------------------------------------
  // Auth & API Service Handlers
  // -------------------------------------------------------------

  const checkAuthAndLoad = async () => {
    const currentGen = authGenerationRef.current;
    try {
      const auth = await ApiClient.checkAuth();
      if (authGenerationRef.current !== currentGen) return;
      if (auth.authenticated) {
        authStatusRef.current = true;
        setIsAuthenticated(true);
        setUsername(auth.username || 'user');
        await loadDashboard();
      } else {
        authStatusRef.current = false;
        setIsAuthenticated(false);
      }
    } catch (e) {
      if (authGenerationRef.current === currentGen) {
        authStatusRef.current = false;
        setIsAuthenticated(false);
      }
    } finally {
      setAuthChecked(true);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      setLoginError('Please fill in all credentials.');
      return;
    }
    setLoginLoading(true);
    setLoginError('');
    const currentGen = authGenerationRef.current;
    try {
      const res = await ApiClient.login(loginUsername, loginPassword);
      if (authGenerationRef.current !== currentGen) return;
      if (res.success) {
        authStatusRef.current = true;
        authGenerationRef.current += 1;
        setIsAuthenticated(true);
        setUsername(res.username);
        setLoginUsername('');
        setLoginPassword('');
        await loadDashboard(true); // Trigger startup summary on fresh login!
      }
    } catch (err: any) {
      if (err.code === 'AUTH_CONFIGURATION_UNAVAILABLE') {
        setLoginError('The server cannot load its login credentials. This is a server configuration problem, not an incorrect password.');
      } else {
        setLoginError(err.message || 'Invalid username or password.');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    clearProtectedState();
    try {
      await ApiClient.logout();
    } catch (e) {
      // ignore
    }
  };

  // Calculate Startup Stats (Phase 18)
  const calculateAndShowStartupSummary = useCallback((data: DashboardSnapshot, isFreshLogin: boolean) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Events today
    const eventsToday = data.calendarEvents.filter(e => {
      return e.start.startsWith(todayStr);
    }).length;

    // Tasks due today
    const tasksDue = data.tasks.filter(t => {
      return t.dueDate === todayStr && !t.completed;
    }).length;

    // Overdue tasks
    const overdueTasks = data.tasks.filter(t => t.isOverdue).length;

    // Favourites modified since previous login (compare with a stored last logout timestamp)
    const lastSessionTime = localStorage.getItem('last_session_timestamp') || new Date(Date.now() - 24*60*60*1000).toISOString();
    const favModifiedSince = ((data as any).favouriteProjects || []).filter((n: any) => {
      return new Date(n.modifiedAt).getTime() > new Date(lastSessionTime).getTime();
    }).length;

    setStartupStats({ eventsToday, tasksDue, overdueTasks, favModifiedSince });

    // Store current login time for next time
    localStorage.setItem('last_session_timestamp', new Date().toISOString());

    // Only display startup summary once on login, or if they haven't seen it in 1 hour
    const lastSeenSummary = localStorage.getItem('last_seen_summary_time');
    const oneHour = 60 * 60 * 1000;
    if (isFreshLogin || !lastSeenSummary || Date.now() - parseInt(lastSeenSummary, 10) > oneHour) {
      setShowStartupSummary(true);
      localStorage.setItem('last_seen_summary_time', Date.now().toString());
    }
  }, []);

  const lastFetchedProjectsContextRef = useRef<string | null>(null);
  const inFlightTodoistProjectsContextRef = useRef<string | null>(null);
  const loadedTodoistProjectsContextRef = useRef<string | null>(null);
  const todoistProjectsRequestGenerationRef = useRef(0);

  const loadTodoistProjects = useCallback(async (context: string, force = false) => {
    if (!authStatusRef.current) return;

    // Prevent duplicate simultaneous requests for the same context
    if (inFlightTodoistProjectsContextRef.current === context) {
      return;
    }

    // Force refresh must bypass a successful-result cache safely
    if (!force && loadedTodoistProjectsContextRef.current === context) {
      // Returning to an already displayed context must still invalidate a
      // different, older context request that is allowed to finish later.
      if (inFlightTodoistProjectsContextRef.current !== context) {
        todoistProjectsRequestGenerationRef.current += 1;
        inFlightTodoistProjectsContextRef.current = null;
        setLoadingProjects(false);
        setProjectsError(null);
      }
      return;
    }

    const currentGen = authGenerationRef.current;
    const currentRequestGen = ++todoistProjectsRequestGenerationRef.current;
    inFlightTodoistProjectsContextRef.current = context;
    setLoadingProjects(true);
    setProjectsError(null);

    try {
      const data = await ApiClient.getTodoistProjects(context);
      
      // Mark as successfully loaded only after the API request succeeds and its result is accepted as current
      if (
        authStatusRef.current &&
        authGenerationRef.current === currentGen &&
        todoistProjectsRequestGenerationRef.current === currentRequestGen
      ) {
        setTodoistProjects(data);
        loadedTodoistProjectsContextRef.current = context;
      }
    } catch (err: any) {
      if (
        authStatusRef.current &&
        authGenerationRef.current === currentGen &&
        todoistProjectsRequestGenerationRef.current === currentRequestGen
      ) {
        setProjectsError(err.message || 'Failed to load projects');
      }
    } finally {
      // Clear the in-flight marker in a finally block
      if (
        inFlightTodoistProjectsContextRef.current === context &&
        todoistProjectsRequestGenerationRef.current === currentRequestGen
      ) {
        inFlightTodoistProjectsContextRef.current = null;
      }
      if (
        authStatusRef.current &&
        authGenerationRef.current === currentGen &&
        todoistProjectsRequestGenerationRef.current === currentRequestGen
      ) {
        setLoadingProjects(false);
      }
    }
  }, []);

  const fetchProjects = useCallback(async (context: string) => {
    await loadTodoistProjects(context);
  }, [loadTodoistProjects]);

  const loadDashboard = useCallback(async (isFreshLogin = false) => {
    const currentGen = authGenerationRef.current;
    setLoading(true);
    setRefreshError(null);

    // Try loading cached dashboard first for near-instant boot or offline fallback
    const cached = localStorage.getItem('life_site_snapshot');
    if (cached) {
      try {
        const snapshot = JSON.parse(cached) as DashboardSnapshot;
        if (authStatusRef.current && authGenerationRef.current === currentGen) {
          setDashboardData(snapshot);
          setSettings(snapshot.settings);
          setThemeMode(snapshot.settings.theme === 'dark' ? 'dark' : 'light');
          setCalendarView(snapshot.settings.defaultCalendarView || 'day');
          setLastUpdated(new Date(snapshot.fetchedAt).toLocaleTimeString('en-GB'));
        }
        
        if (isOffline) {
          if (authStatusRef.current && authGenerationRef.current === currentGen) {
            setLoading(false);
          }
          return;
        }
      } catch (e) {
        // ignore malformed cache
      }
    }

    try {
      const data = await ApiClient.getDashboard();
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setDashboardData(data);
        setSettings(data.settings);
        setThemeMode(data.settings.theme === 'dark' ? 'dark' : 'light');
        setCalendarView(data.settings.defaultCalendarView || 'day');
        setLastUpdated(new Date(data.fetchedAt).toLocaleTimeString('en-GB'));
        
        // Save snapshot to local cache
        localStorage.setItem('life_site_snapshot', JSON.stringify(data));

        // Calculate startup stats
        calculateAndShowStartupSummary(data, isFreshLogin);

        // Also fetch projects
        await loadTodoistProjects(activeTab);
      }
    } catch (err: any) {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setRefreshError(err.message || 'Failed to sync with API server.');
      }
    } finally {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setLoading(false);
      }
    }
  }, [activeTab, isOffline, loadTodoistProjects, calculateAndShowStartupSummary]);

  const triggerRefresh = useCallback(async () => {
    if (isOffline) return;
    const currentGen = authGenerationRef.current;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const data = await ApiClient.getDashboard();
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setDashboardData(data);
        setSettings(data.settings);
        setLastUpdated(new Date(data.fetchedAt).toLocaleTimeString('en-GB'));
        localStorage.setItem('life_site_snapshot', JSON.stringify(data));
        // Also refetch projects (force refresh)
        await loadTodoistProjects(activeTab, true);
        // Also fetch Obsidian recent notes
        loadRecentNotes();
      }
    } catch (err: any) {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setRefreshError(err.message || 'Dashboard refresh failed.');
      }
    } finally {
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setRefreshing(false);
      }
    }
  }, [isOffline, activeTab, loadTodoistProjects, loadRecentNotes]);

  // Refetch projects when context/tab changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchProjects(activeTab);
    }
  }, [activeTab, isAuthenticated, fetchProjects]);

  // Auto-refresh interval sync
  useEffect(() => {
    if (!isAuthenticated || !settings || selectedRecentNote) return;
    const intervalMs = (settings.refreshIntervalMinutes || 5) * 60 * 1000;
    const interval = setInterval(() => {
      triggerRefresh();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [isAuthenticated, settings, selectedRecentNote]);

  // Sync selectedTask with fresh dashboard data on refresh
  useEffect(() => {
    if (selectedTask && dashboardData) {
      const freshTask = dashboardData.tasks.find(t => t.id === selectedTask.id);
      if (freshTask) {
        setSelectedTask(freshTask);
      } else {
        setSelectedTask(null);
      }
    }
  }, [dashboardData]);

  // -------------------------------------------------------------
  // Keyboard Shortcuts Registration (Phase 19)
  // -------------------------------------------------------------

  useKeyboardShortcuts({
    onFocusSearch: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    onFocusNotes: () => {
      notesInputRef.current?.focus();
    },
    onFocusTasks: () => {
      tasksInputRef.current?.focus();
    },
    onRefresh: () => {
      triggerRefresh();
    },
    onSwitchTab: (tabIndex) => {
      if (tabIndex === 0) setActiveTab('combined');
      else if (tabIndex === 1) setActiveTab('personal');
      else if (tabIndex === 2) setActiveTab('professional');
    },
    onClosePanels: () => {
      // Prioritized sequential dismissal on Escape
      if (movingTaskMenu) {
        setMovingTaskMenu(null);
        return;
      }
      if (confirmingCompleteTask) {
        setConfirmingCompleteTask(null);
        return;
      }
      if (selectedEvent) {
        setSelectedEvent(null);
        return;
      }
      if (selectedTask) {
        setSelectedTask(null);
        return;
      }
      if (selectedNote) {
        setSelectedNote(null);
        return;
      }
      if (showAddEventForm) {
        setShowAddEventForm(false);
        return;
      }
      if (showStartupSummary) {
        setShowStartupSummary(false);
        return;
      }
      if (showSettings) {
        setShowSettings(false);
        return;
      }
      if (searchQuery) {
        clearSearch();
      }
    }
  });

  // -------------------------------------------------------------
  // Settings and Connections Operations (Phase 20)
  // -------------------------------------------------------------

  const settingsReqIdRef = useRef(0);

  const prepareSettingsWorkspace = async () => {
    const currentGen = authGenerationRef.current;
    if (settings) {
      setSettingsEditState(JSON.parse(JSON.stringify(settings)));
    }
    // Fetch connection diagnostic statuses
    try {
      const conn = await ApiClient.getConnections();
      if (authStatusRef.current && authGenerationRef.current === currentGen) {
        setConnectionsStatus(conn);
        setSecretsForm({
          todoistToken: '',
          googleClientId: '',
          googleClientSecret: ''
        });
      }
    } catch (e) {
      // ignore
    }
  };

  const openSettings = async () => {
    setShowSettings(true);
    await prepareSettingsWorkspace();
  };

  const handleEntranceHallViewChange = async (view: EntranceHallView) => {
    setEntranceHallView(view);
    if (view === 'settings') {
      await prepareSettingsWorkspace();
    }
  };

  const handleSaveSettings = async () => {
    if (!settingsEditState) return;
    const currentGen = authGenerationRef.current;
    setLoading(true);
    setSaveSettingsSuccess(false);
    try {
      const updated = await ApiClient.saveSettings(settingsEditState);
      if (!isAuthGenerationCurrent(currentGen)) return;
      
      // Update local storage cache to avoid stale settings load
      const cached = localStorage.getItem('life_site_snapshot');
      if (cached) {
        try {
          const snapshot = JSON.parse(cached);
          snapshot.settings = updated;
          localStorage.setItem('life_site_snapshot', JSON.stringify(snapshot));
        } catch (_) {}
      }

      if (isAuthGenerationCurrent(currentGen)) {
        setSettings(updated);
        setThemeMode(updated.theme === 'dark' ? 'dark' : 'light');
        setCalendarView(updated.defaultCalendarView || 'day');
        setSaveSettingsSuccess(true);
        setTimeout(() => {
          if (authStatusRef.current && authGenerationRef.current === currentGen) {
            setSaveSettingsSuccess(false);
          }
        }, 3000);
        await loadDashboard();
      }
    } catch (err) {
      if (isAuthGenerationCurrent(currentGen)) {
        alert('Failed to save settings.');
      }
    } finally {
      if (isAuthGenerationCurrent(currentGen)) {
        setLoading(false);
      }
    }
  };

  const handleSaveConnections = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentGen = authGenerationRef.current;
    setLoading(true);
    try {
      const payload: any = {};
      
      // Only send if the user typed a new token
      if (secretsForm.todoistToken && secretsForm.todoistToken.trim() !== '') {
        payload.todoistToken = secretsForm.todoistToken.trim();
      }
      
      if (secretsForm.googleClientId !== undefined) {
        payload.googleClientId = secretsForm.googleClientId;
      }
      
      // Only send if the user typed a new secret
      if (secretsForm.googleClientSecret && secretsForm.googleClientSecret.trim() !== '') {
        payload.googleClientSecret = secretsForm.googleClientSecret.trim();
      }

      await ApiClient.saveConnections(payload);
      if (!isAuthGenerationCurrent(currentGen)) return;

      // Reset Todoist markers when Todoist is connected, reconnected or disconnected
      lastFetchedProjectsContextRef.current = null;
      inFlightTodoistProjectsContextRef.current = null;
      loadedTodoistProjectsContextRef.current = null;
      todoistProjectsRequestGenerationRef.current += 1;

      alert('Credentials saved securely on the server.');
      // Refresh connection data
      const conn = await ApiClient.getConnections();
      if (isAuthGenerationCurrent(currentGen)) {
        setConnectionsStatus(conn);
        setSecretsForm(prev => ({ ...prev, todoistToken: '', googleClientSecret: '' }));
        await loadDashboard();
      }
    } catch (e: any) {
      if (isAuthGenerationCurrent(currentGen)) {
        alert(e.message || 'Failed to save connection secrets.');
      }
    } finally {
      if (isAuthGenerationCurrent(currentGen)) {
        setLoading(false);
      }
    }
  };

  const handleRemoveTodoistToken = async () => {
    if (!confirm('Are you sure you want to remove your Todoist token?')) return;
    const currentGen = authGenerationRef.current;
    setLoading(true);
    try {
      await ApiClient.saveConnections({ action: 'remove_todoist_token' });
      if (!isAuthGenerationCurrent(currentGen)) return;

      // Reset Todoist markers when Todoist is connected, reconnected or disconnected
      lastFetchedProjectsContextRef.current = null;
      inFlightTodoistProjectsContextRef.current = null;
      loadedTodoistProjectsContextRef.current = null;
      todoistProjectsRequestGenerationRef.current += 1;

      alert('Todoist API token removed successfully.');
      const conn = await ApiClient.getConnections();
      if (isAuthGenerationCurrent(currentGen)) {
        setConnectionsStatus(conn);
        setSecretsForm(prev => ({ ...prev, todoistToken: '', googleClientSecret: '' }));
        await loadDashboard();
      }
    } catch (e: any) {
      if (isAuthGenerationCurrent(currentGen)) {
        alert(e.message || 'Failed to remove Todoist token.');
      }
    } finally {
      if (isAuthGenerationCurrent(currentGen)) {
        setLoading(false);
      }
    }
  };

  const handleConnectGoogleCalendar = async () => {
    const currentGen = authGenerationRef.current;
    try {
      const res = await ApiClient.getGoogleAuthUrl();
      if (isAuthGenerationCurrent(currentGen) && res.url) {
        // Redirect browser to Google Consent Screen
        window.location.href = res.url;
      }
    } catch (e: any) {
      if (isAuthGenerationCurrent(currentGen)) {
        alert(e.message || 'Could not fetch Google Calendar auth URL. Ensure Client ID is configured first.');
      }
    }
  };

  // -------------------------------------------------------------
  // Data Filter Logic for Active Tab (Context-sensitive views)
  // -------------------------------------------------------------

  const filteredData = useMemo(() => {
    if (!dashboardData) return null;

    let calendarEvents = dashboardData.calendarEvents;
    let tasks = dashboardData.tasks;
    let notes = dashboardData.notes;
    let favouriteProjects = dashboardData.favouriteProjects || [];

    const settings = dashboardData.settings;

    // Filter calendar events based on selected calendar IDs for the active context
    const activeSelectedCalendarIds = settings?.calendar?.selectedCalendarIdsByContext?.[activeTab]
      ?? (activeTab === 'combined' ? (settings?.calendar?.selectedCalendarIds || ['primary']) : (activeTab === 'personal' ? ['primary'] : []));

    calendarEvents = calendarEvents.filter(e => activeSelectedCalendarIds.includes(e.calendarId));

    if (activeTab === 'personal') {
      const personalLabel = settings?.todoist?.personalLabel || 'personal';
      tasks = tasks.filter(t => t.labels.includes(personalLabel) || t.context === 'personal');
      notes = notes.filter(n => n.folder === settings?.obsidian?.personalFolder);
      favouriteProjects = favouriteProjects.filter(n => n.path.startsWith(settings?.obsidian?.personalFolder));
    } else if (activeTab === 'professional') {
      const proLabel = settings?.todoist?.professionalLabel || 'professional';
      tasks = tasks.filter(t => t.labels.includes(proLabel) || t.context === 'professional');
      notes = notes.filter(n => n.folder === settings?.obsidian?.professionalFolder);
      favouriteProjects = favouriteProjects.filter(n => n.path.startsWith(settings?.obsidian?.professionalFolder));
    }

    return { calendarEvents, tasks, notes, favouriteProjects };
  }, [dashboardData, activeTab]);

  // Task grouping helper
  const taskGroups = useMemo(() => {
    if (!filteredData) return { overdue: [], today: [], upcoming: [], completed: [] };
    
    const overdue: TodoistTask[] = [];
    const today: TodoistTask[] = [];
    const upcoming: TodoistTask[] = [];
    const completed: TodoistTask[] = [];

    const todayStr = new Date().toISOString().split('T')[0];

    filteredData.tasks.forEach(t => {
      if (t.parentId) {
        // Exclude subtasks from main dashboard groupings
        return;
      }
      if (t.completed) {
        completed.push(t);
      } else if (t.isOverdue) {
        overdue.push(t);
      } else if (t.dueDate === todayStr) {
        today.push(t);
      } else {
        upcoming.push(t);
      }
    });

    return { overdue, today, upcoming, completed };
  }, [filteredData]);

  // Today view tasks: Overdue tasks first, then tasks due today. Do not display future tasks.
  const todayTasks = useMemo(() => {
    return [...taskGroups.overdue, ...taskGroups.today];
  }, [taskGroups.overdue, taskGroups.today]);

  // Todoist board sections helper (Stage 2)
  const sectionsData = useMemo(() => {
    if (!filteredData || !dashboardData) return { columns: [], activeCount: 0 };

    const todoistInboxProjectId = dashboardData.todoistInboxProjectId;
    const activeTasks = filteredData.tasks.filter(t => !t.completed && !t.parentId);
    const sections = dashboardData.todoistSections || [];

    // Filter tasks by Inbox Project ID
    const inboxTasks = activeTasks.filter(
      t => String(t.projectId) === String(todoistInboxProjectId)
    );

    // Filter sections by Inbox Project ID
    const inboxSections = sections.filter(
      s => String(s.projectId) === String(todoistInboxProjectId)
    );

    // Diagnostics safely checked
    const totalInboxTasks = inboxTasks.length;
    const totalInboxSections = inboxSections.length;
    const tasksWithSectionId = inboxTasks.filter(t => t.sectionId).length;
    
    // Create section map with stringified IDs
    const sectionMap = new Map<string, TodoistSection>();
    inboxSections.forEach(s => {
      sectionMap.set(String(s.id), s);
    });

    const matchedCount = inboxTasks.filter(t => t.sectionId && sectionMap.has(String(t.sectionId))).length;
    const unmatchedCount = totalInboxTasks - matchedCount;

    console.info('[Todoist Inbox Diagnostics]:', {
      totalInboxTasks,
      totalInboxSections,
      tasksWithSectionId,
      matchedCount,
      unmatchedCount
    });

    // Group tasks
    const noSectionTasks: TodoistTask[] = [];
    const sectionTasksMap = new Map<string, TodoistTask[]>();

    inboxTasks.forEach(t => {
      const sId = t.sectionId ? String(t.sectionId) : '';
      if (!sId || !sectionMap.has(sId)) {
        noSectionTasks.push(t);
      } else {
        if (!sectionTasksMap.has(sId)) {
          sectionTasksMap.set(sId, []);
        }
        sectionTasksMap.get(sId)!.push(t);
      }
    });

    // Real columns (Display all real sections, even when empty!)
    const realCols = inboxSections
      .map(s => {
        const sId = String(s.id);
        const tasks = sectionTasksMap.get(sId) || [];
        return {
          id: sId,
          name: s.name,
          order: s.sectionOrder ?? 0,
          tasks
        };
      });

    // Sort real columns by order ascending, then name secondary
    realCols.sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.name.localeCompare(b.name);
    });

    // Build final columns array
    const columns: {
      id: string;
      name: string;
      order: number;
      tasks: TodoistTask[];
      isDuplicate?: boolean;
    }[] = [];

    if (noSectionTasks.length > 0) {
      columns.push({
        id: 'no-section',
        name: 'No Section',
        order: -1,
        tasks: noSectionTasks
      });
    }
    columns.push(...realCols);

    return {
      columns,
      activeCount: inboxTasks.length
    };
  }, [filteredData, dashboardData]);

  // Derived active mobile section ID for board mode (Stage 2)
  const activeMobileSectionId = useMemo(() => {
    if (sectionsData.columns.length === 0) return null;

    const isPresent = sectionsData.columns.some(col => col.id === selectedMobileSectionId);
    if (isPresent && selectedMobileSectionId !== null) {
      return selectedMobileSectionId;
    }

    // Default selection logic:
    // 1. Select "no-section" if it is present and contains tasks
    const hasNoSection = sectionsData.columns.some(col => col.id === 'no-section');
    if (hasNoSection) {
      return 'no-section';
    }

    // 2. Otherwise select the first real non-empty section
    const firstNonEmptyReal = sectionsData.columns.find(col => col.id !== 'no-section' && col.tasks.length > 0);
    if (firstNonEmptyReal) {
      return firstNonEmptyReal.id;
    }

    // 3. Fallback to the first available section
    return sectionsData.columns[0].id;
  }, [sectionsData.columns, selectedMobileSectionId]);

  const handleCompleteTask = async (taskId: string) => {
    if (completingTaskIds.has(taskId)) return;
    const currentGen = authGenerationRef.current;

    // Clear any previous error
    setTaskErrors(prev => {
      const copy = { ...prev };
      delete copy[taskId];
      return copy;
    });

    // Start loading
    setCompletingTaskIds(prev => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });

    try {
      await ApiClient.completeTodoistTask(taskId);
      if (!isAuthGenerationCurrent(currentGen)) return;

      // Success animation
      setJustCompletedTaskIds(prev => {
        const next = new Set(prev);
        next.add(taskId);
        return next;
      });

      // Set completed in local state immediately so upcoming/due counts update
      setDashboardData(prev => {
        if (!prev) return null;
        return {
          ...prev,
          tasks: prev.tasks.map(t => t.id === taskId ? { ...t, completed: true } : t)
        };
      });

      // Keep checked/completed animation visible for 800ms, then trigger refresh
      setTimeout(async () => {
        if (!isAuthGenerationCurrent(currentGen)) return;
        setCompletingTaskIds(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        setJustCompletedTaskIds(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        await triggerRefresh();
      }, 800);

    } catch (err: any) {
      if (!isAuthGenerationCurrent(currentGen)) return;
      setTaskErrors(prev => ({
        ...prev,
        [taskId]: err.message || 'Failed to complete task'
      }));
      setCompletingTaskIds(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleSaveTaskDetails = async (
    taskId: string,
    details: { content: string; description: string; dueDate: string | null; priority: number }
  ) => {
    const currentGen = authGenerationRef.current;
    await ApiClient.updateTodoistTask(taskId, details);
    if (isAuthGenerationCurrent(currentGen)) {
      await triggerRefresh();
    }
  };

  const handleMoveTask = async (
    taskId: string,
    move: { projectId: string; sectionId?: string }
  ) => {
    const currentGen = authGenerationRef.current;
    await ApiClient.moveTodoistTask(taskId, move);
    if (isAuthGenerationCurrent(currentGen)) {
      await triggerRefresh();
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, task: TodoistTask) => {
    if (!canDrag) return;
    setDraggingTaskId(task.id);
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverColumnId(null);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    if (!canDrag || !draggingTaskId) return;
    e.preventDefault(); // Required to allow dropping
    if (dragOverColumnId !== columnId) {
      setDragOverColumnId(columnId);
    }
  };

  const handleDrop = async (e: React.DragEvent, destColumnId: string) => {
    if (!canDrag) return;
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    setDraggingTaskId(null);
    setDragOverColumnId(null);

    if (!taskId) return;
    const currentGen = authGenerationRef.current;

    // Find the task in our dashboardData
    const task = dashboardData?.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Check if the destination is the current location
    const currentSecId = task.sectionId || 'no-section';
    if (currentSecId === destColumnId) return;

    // Add to moving list
    setMovingTaskIds(prev => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });

    // Clear any previous error on this task
    setTaskErrors(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });

    try {
      const isNoSection = destColumnId === 'no-section';
      const moveParams = {
        projectId: dashboardData?.todoistInboxProjectId || task.projectId || '',
        sectionId: isNoSection ? undefined : destColumnId
      };

      await ApiClient.moveTodoistTask(taskId, moveParams);
      if (!isAuthGenerationCurrent(currentGen)) return;
      await triggerRefresh();
    } catch (err: any) {
      if (!isAuthGenerationCurrent(currentGen)) return;
      console.error('Drag and drop move failed:', err);
      let msg = err.message || 'Failed to move task.';
      if (msg.toLowerCase().includes('bearer') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('key') || msg.toLowerCase().includes('auth')) {
        msg = 'Authentication error. Please verify your connection configuration.';
      }
      setTaskErrors(prev => ({
        ...prev,
        [taskId]: msg
      }));
    } finally {
      if (isAuthGenerationCurrent(currentGen)) {
        setMovingTaskIds(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    }
  };

  const handleCompleteProjectTask = async (taskId: string, projectId: string) => {
    if (completingTaskIds.has(taskId)) return;
    const currentGen = authGenerationRef.current;

    setCompletingTaskIds(prev => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });

    try {
      await ApiClient.completeTodoistTask(taskId);
      if (!isAuthGenerationCurrent(currentGen)) return;
      
      // Success animation
      setJustCompletedTaskIds(prev => {
        const next = new Set(prev);
        next.add(taskId);
        return next;
      });

      // Set completed in local project tasks state immediately
      setProjectTasks(prev => {
        const current = prev[projectId] || [];
        return {
          ...prev,
          [projectId]: current.map(t => t.id === taskId ? { ...t, completed: true, completedAt: new Date().toISOString() } : t)
        };
      });

      // Keep checked/completed animation visible for 800ms, then trigger refresh
      setTimeout(async () => {
        if (!isAuthGenerationCurrent(currentGen)) return;
        setCompletingTaskIds(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        setJustCompletedTaskIds(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        
        // Refresh project summaries and dashboard snapshot
        await fetchProjects(activeTab);
        await triggerRefresh();
      }, 800);

    } catch (err: any) {
      if (isAuthGenerationCurrent(currentGen)) {
        alert(err.message || 'Failed to complete project task');
        setCompletingTaskIds(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    }
  };

  const toggleProjectExpand = async (projectId: string) => {
    const currentGen = authGenerationRef.current;
    const isExpanding = !expandedProjectIds[projectId];
    setExpandedProjectIds(prev => ({ ...prev, [projectId]: isExpanding }));
    
    if (isExpanding && !projectTasks[projectId]) {
      setLoadingProjectTasks(prev => ({ ...prev, [projectId]: true }));
      try {
        const tasks = await ApiClient.getTodoistProjectTasks(projectId);
        if (isAuthGenerationCurrent(currentGen)) {
          setProjectTasks(prev => ({ ...prev, [projectId]: tasks }));
        }
      } catch (err: any) {
        if (isAuthGenerationCurrent(currentGen)) {
          setProjectTasksError(prev => ({ ...prev, [projectId]: err.message || 'Failed to load tasks' }));
        }
      } finally {
        if (isAuthGenerationCurrent(currentGen)) {
          setLoadingProjectTasks(prev => ({ ...prev, [projectId]: false }));
        }
      }
    }
  };

  const handleAddComment = async (taskId: string) => {
    const commentContent = (taskComments[taskId] || '').trim();
    if (!commentContent) return;

    if (commentSavingTaskIds.has(taskId)) return;
    const currentGen = authGenerationRef.current;

    // Clear previous states
    setTaskErrors(prev => {
      const copy = { ...prev };
      delete copy[taskId];
      return copy;
    });
    setCommentSuccessMessages(prev => {
      const copy = { ...prev };
      delete copy[taskId];
      return copy;
    });

    // Start loading
    setCommentSavingTaskIds(prev => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });

    try {
      await ApiClient.addTodoistComment(taskId, commentContent);
      if (!isAuthGenerationCurrent(currentGen)) return;

      // Success message
      setCommentSuccessMessages(prev => ({
        ...prev,
        [taskId]: 'Comment added successfully'
      }));

      // Clear comment content
      setTaskComments(prev => ({
        ...prev,
        [taskId]: ''
      }));

      // Close after a brief delay so the user can see the "Comment added" confirmation
      setTimeout(() => {
        if (!isAuthGenerationCurrent(currentGen)) return;
        setActiveCommentTaskId(null);
        setCommentSuccessMessages(prev => {
          const copy = { ...prev };
          delete copy[taskId];
          return copy;
        });
      }, 1500);

    } catch (err: any) {
      if (isAuthGenerationCurrent(currentGen)) {
        setTaskErrors(prev => ({
          ...prev,
          [taskId]: err.message || 'Failed to add comment'
        }));
      }
    } finally {
      if (isAuthGenerationCurrent(currentGen)) {
        setCommentSavingTaskIds(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    }
  };

  // -------------------------------------------------------------
  // Submission Capture Handlers (Phase 9 & 12)
  // -------------------------------------------------------------

  const submitTodoistTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!todoistInput.trim() || isOffline) return;
    const currentGen = authGenerationRef.current;

    setTodoistLoading(true);
    setTodoistSuccess(false);
    setTodoistError(null);
    stopVoiceTodoist();

    const finalContext = activeTab === 'combined' ? todoistContext : activeTab;

    try {
      await ApiClient.createTodoistTask(todoistInput.trim(), finalContext as 'personal' | 'professional');
      if (!isAuthGenerationCurrent(currentGen)) return;
      setTodoistInput('');
      setTodoistSuccess(true);
      setTimeout(() => {
        if (isAuthGenerationCurrent(currentGen)) setTodoistSuccess(false);
      }, 3000);
      tasksInputRef.current?.focus();
      await triggerRefresh(); // Lightweight sync
    } catch (err: any) {
      if (isAuthGenerationCurrent(currentGen)) {
        setTodoistError(err.message || 'Failed to submit task.');
      }
    } finally {
      if (isAuthGenerationCurrent(currentGen)) {
        setTodoistLoading(false);
      }
    }
  };

  const submitTodayTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!todayTaskTitle.trim() || isOffline) return;
    const currentGen = authGenerationRef.current;

    setTodayTaskLoading(true);
    setTodayTaskError(null);

    const finalContext = activeTab === 'combined' ? todayTaskContext : activeTab;
    const localToday = (() => {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    })();

    try {
      await ApiClient.createTodoistTask(todayTaskTitle.trim(), finalContext as 'personal' | 'professional', {
        description: todayTaskDesc.trim() || undefined,
        priority: todayTaskPriority,
        dueDate: localToday
      });
      if (!isAuthGenerationCurrent(currentGen)) return;
      setTodayTaskTitle('');
      setTodayTaskDesc('');
      setTodayTaskPriority(1);
      setIsAddingTodayTask(false);
      await triggerRefresh();
    } catch (err: any) {
      if (!isAuthGenerationCurrent(currentGen)) return;
      let msg = err.message || 'Failed to create task.';
      if (msg.toLowerCase().includes('bearer') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('key') || msg.toLowerCase().includes('auth')) {
        msg = 'Authentication error. Please verify your connection configuration.';
      }
      setTodayTaskError(msg);
    } finally {
      if (isAuthGenerationCurrent(currentGen)) {
        setTodayTaskLoading(false);
      }
    }
  };

  const toggleAddingTaskForSection = (sectionId: string) => {
    if (addingTaskForSectionId === sectionId) {
      setAddingTaskForSectionId(null);
    } else {
      setAddingTaskForSectionId(sectionId);
      setBoardTaskTitle('');
      setBoardTaskDesc('');
      setBoardTaskPriority(1);
      setBoardTaskContext('personal');
      setBoardTaskError(null);
    }
  };

  const submitBoardTask = async (e: React.FormEvent, sectionId: string) => {
    e.preventDefault();
    if (!boardTaskTitle.trim() || isOffline) return;
    const currentGen = authGenerationRef.current;

    setBoardTaskLoading(true);
    setBoardTaskError(null);

    const finalContext = activeTab === 'combined' ? boardTaskContext : activeTab;
    const isNoSection = sectionId === 'no-section';

    try {
      await ApiClient.createTodoistTask(boardTaskTitle.trim(), finalContext as 'personal' | 'professional', {
        description: boardTaskDesc.trim() || undefined,
        priority: boardTaskPriority,
        projectId: dashboardData?.todoistInboxProjectId || undefined,
        sectionId: isNoSection ? undefined : sectionId
      });
      if (!isAuthGenerationCurrent(currentGen)) return;
      setBoardTaskTitle('');
      setBoardTaskDesc('');
      setBoardTaskPriority(1);
      setAddingTaskForSectionId(null);
      await triggerRefresh();
    } catch (err: any) {
      if (!isAuthGenerationCurrent(currentGen)) return;
      let msg = err.message || 'Failed to create task.';
      if (msg.toLowerCase().includes('bearer') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('key') || msg.toLowerCase().includes('auth')) {
        msg = 'Authentication error. Please verify your connection configuration.';
      }
      setBoardTaskError(msg);
    } finally {
      if (isAuthGenerationCurrent(currentGen)) {
        setBoardTaskLoading(false);
      }
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      notesInputRef.current?.focus();
    }
  };

  const handleMobileCopyNote = async () => {
    if (!obsidianInput.trim() || isOffline) return;
    const previousStatus = mobileHandoffStatus;
    try {
      const titleText = obsidianTitle.trim() ? `# ${obsidianTitle.trim()}\n\n` : '';
      const fullText = `${titleText}${obsidianInput.trim()}`;
      await navigator.clipboard.writeText(fullText);
      
      setMobileHandoffStatus('copied');
      setTimeout(() => {
        setMobileHandoffStatus(previousStatus === 'copied' ? 'available' : previousStatus);
      }, 3000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      setMobileHandoffStatus('failed');
      setTimeout(() => {
        setMobileHandoffStatus(previousStatus);
      }, 3000);
    }
  };

  const getSelectedContext = useCallback(() => {
    if (activeTab === 'personal') return 'personal';
    if (activeTab === 'professional') return 'professional';
    return obsidianContext;
  }, [activeTab, obsidianContext]);

  const getAppendTargetFile = useCallback(() => {
    const ctx = getSelectedContext();
    return ctx === 'personal'
      ? settings?.obsidian?.personalInboxFile || ''
      : settings?.obsidian?.professionalInboxFile || '';
  }, [getSelectedContext, settings]);

  const getMobileObsidianDeepLink = useCallback(() => {
    const vault = settings?.obsidian?.vaultName || "Francisco's Vault";
    if (obsidianMode === 'append') {
      const filePath = getAppendTargetFile();
      return filePath ? ObsidianClient.buildObsidianAppendNoteUri(vault, filePath, obsidianInput.trim()) : '';
    } else {
      let baseName = '';
      const trimmedTitle = obsidianTitle.trim();
      if (trimmedTitle) {
        baseName = ObsidianClient.cleanFileName(trimmedTitle);
      }
      if (!baseName) {
        baseName = ObsidianClient.generateUniqueBaseName(obsidianInput.trim());
      }
      const fileName = `${baseName}.md`;
      const folder = settings?.obsidian?.inboxFolder || 'Fleeting Notes';
      return ObsidianClient.buildObsidianNewNoteUri(vault, folder, fileName, obsidianInput.trim());
    }
  }, [settings, obsidianMode, obsidianTitle, obsidianInput, getAppendTargetFile]);

  const handleOpenObsidianAgain = () => {
    const uri = getMobileObsidianDeepLink();
    if (uri) {
      window.location.href = uri;
    }
  };

  const handleClearSavedDraft = () => {
    const isEmpty = !obsidianTitle.trim() && !obsidianInput.trim();
    if (!isEmpty) {
      const confirmClear = window.confirm("Are you sure you want to clear your saved draft? This cannot be undone.");
      if (!confirmClear) return;
    }
    setObsidianTitle('');
    setObsidianInput('');
    try {
      localStorage.removeItem('life_site_mobile_draft_title');
      localStorage.removeItem('life_site_mobile_draft_content');
    } catch (_) {}
    setMobileHandoffStatus('available');
  };

  const handleMobileSaveInObsidian = () => {
    if (!obsidianInput.trim() || isOffline) return;
    const uri = getMobileObsidianDeepLink();
    if (uri) {
      window.location.href = uri;
      setMobileHandoffStatus('success');
    }
  };

  const submitObsidianNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsidianInput.trim() || isOffline) return;
    const currentGen = authGenerationRef.current;

    if (getActiveObsidianMode() === 'mobile') {
      handleMobileSaveInObsidian();
      return;
    }

    setObsidianLoading(true);
    setObsidianSuccess(false);
    setObsidianError(null);
    setObsidianErrorDetails(null);
    stopVoiceObsidian();

    const folder = settings?.obsidian?.inboxFolder || 'Fleeting Notes';

    try {
      if (!obsidianUrl || !obsidianApiKey) {
        throw new Error('Obsidian connection not configured. Please enter your API Key in the settings panel.');
      }

      let baseName = '';
      const trimmedTitle = obsidianTitle.trim();
      if (trimmedTitle) {
        // Remove manually entered .md ending
        let cleanedTitle = trimmedTitle.replace(/\.md$/i, '');
        // Remove unsafe filename characters
        cleanedTitle = cleanedTitle.replace(/[\\/:*?"<>|]/g, '');
        // Trim again
        cleanedTitle = cleanedTitle.trim();
        // Limit to 100 characters
        if (cleanedTitle.length > 100) {
          cleanedTitle = cleanedTitle.substring(0, 100).trim();
        }
        
        if (cleanedTitle) {
          baseName = cleanedTitle;
        }
      }

      if (!baseName) {
        baseName = ObsidianClient.generateUniqueBaseName(obsidianInput.trim());
      }

      let fileName = `${baseName}.md`;
      let attempts = 0;
      
      while (await ObsidianClient.checkFileExists(obsidianUrl, obsidianApiKey, `${folder}/${fileName}`) && attempts < 20) {
        if (!isAuthGenerationCurrent(currentGen)) return;
        attempts++;
        fileName = `${baseName}-${attempts + 1}.md`;
      }

      if (attempts >= 20) {
        // Fallback to timestamp if extremely congested
        const now = new Date();
        const timestampStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        fileName = `${baseName}-${timestampStr}.md`;
      }

      const filePath = `${folder}/${fileName}`;
      if (!isAuthGenerationCurrent(currentGen)) return;
      await ObsidianClient.createFile(obsidianUrl, obsidianApiKey, filePath, obsidianInput.trim());
      if (!isAuthGenerationCurrent(currentGen)) return;

      setObsidianInput('');
      setObsidianTitle('');
      setObsidianSuccess(true);
      setTimeout(() => {
        if (isAuthGenerationCurrent(currentGen)) setObsidianSuccess(false);
      }, 3000);
      
      // Refresh Recent Notes immediately
      await loadRecentNotes();

      // Focus the title field, ready for another note
      obsidianTitleRef.current?.focus();
    } catch (err: any) {
      if (!isAuthGenerationCurrent(currentGen)) return;
      console.error('Error submitting note:', err);
      const errMsg = getObsidianErrorMessage(err, folder, false);
      setObsidianError(errMsg);
      setObsidianErrorDetails(err instanceof ObsidianApiError ? {
        method: err.method,
        url: err.url,
        status: err.status,
        responseBody: err.responseBody,
        location: 'browser'
      } : null);
    } finally {
      if (isAuthGenerationCurrent(currentGen)) {
        setObsidianLoading(false);
      }
    }
  };

  // Global search trigger (Phase 14)
  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      clearSearch();
      return;
    }
    const currentSearchGen = ++searchGenerationRef.current;
    const currentAuthGen = authGenerationRef.current;
    setIsSearching(true);
    try {
      const res = await ApiClient.search(val, activeTab);
      if (
        authStatusRef.current &&
        authGenerationRef.current === currentAuthGen &&
        searchGenerationRef.current === currentSearchGen
      ) {
        setSearchResults(res);
      }
    } catch (e) {
      // ignore
    } finally {
      if (
        authStatusRef.current &&
        authGenerationRef.current === currentAuthGen &&
        searchGenerationRef.current === currentSearchGen
      ) {
        setIsSearching(false);
      }
    }
  };

  // -------------------------------------------------------------
  // Render British clock & Calendar views helpers
  // -------------------------------------------------------------

  const formattedBritishDate = useMemo(() => {
    return currentTime.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, [currentTime]);

  const activeDayEvents = useMemo(() => {
    if (!filteredData) return [];
    const dateStr = currentCalendarDate.toISOString().split('T')[0];
    return filteredData.calendarEvents.filter(e => e.start.startsWith(dateStr));
  }, [filteredData, currentCalendarDate]);

  // Generates 12 hours list based on settings
  const workingHoursList = useMemo(() => {
    let startHour = parseInt(settings?.calendar?.workingHoursStart?.split(':')[0] || '04', 10);
    let endHour = parseInt(settings?.calendar?.workingHoursEnd?.split(':')[0] || '00', 10);
    if (endHour === 0) {
      endHour = 24;
    }
    const hours = [];
    if (startHour >= endHour) {
      startHour = 4;
      endHour = 24;
    }
    for (let h = startHour; h < endHour; h++) {
      hours.push(`${h.toString().padStart(2, '0')}:00`);
    }
    return hours;
  }, [settings]);

  // -------------------------------------------------------------
  // Screen Views Guard & Boot Loader
  // -------------------------------------------------------------

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#faf8ff] text-[#131b2e] flex flex-col items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-[#00288e] border-t-transparent animate-spin"></div>
          <p className="font-display font-medium text-lg tracking-wide">Loading Life Site Dashboard...</p>
        </div>
      </div>
    );
  }

  // Render Login view if unauthenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-[#faf8ff] text-[#131b2e] flex flex-col justify-center items-center px-4 font-sans">
        {/* Glow circles */}
        <div className="blob bg-[#dbeafe] w-[400px] h-[400px] -top-24 -left-24 animate-pulse"></div>
        <div className="blob bg-[#eaedff] w-[500px] h-[500px] -bottom-24 -right-24 animate-pulse"></div>

        <div className="w-full max-w-md bg-white rounded-xl shadow-md border border-[#eaedff] p-8 relative z-10 transition-all">
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl font-extrabold tracking-tighter text-[#00288e] mb-2">dp</h1>
            <h2 className="font-display text-xl font-bold tracking-tight text-[#131b2e]">LIFE SITE DASHBOARD</h2>
            <p className="text-[#444653] text-sm mt-1">Please sign in to access your dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {loginError && (
              <div className="bg-[#ffdad6] border border-[#ba1a1a] rounded p-3 text-[#ba1a1a] text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>{loginError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-semibold tracking-wider text-[#444653] uppercase font-display">Username</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full p-3 border border-[#c4c5d5] rounded focus:outline-none focus:border-[#00288e] bg-[#faf8ff] text-[#131b2e] transition-colors"
                placeholder="Enter username"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold tracking-wider text-[#444653] uppercase font-display">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full p-3 border border-[#c4c5d5] rounded focus:outline-none focus:border-[#00288e] bg-[#faf8ff] text-[#131b2e] transition-colors"
                placeholder="Enter password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-[#00288e] hover:bg-[#1e40af] disabled:bg-opacity-50 text-white font-display font-semibold uppercase tracking-wider py-3 px-4 rounded transition-colors text-sm"
            >
              {loginLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-[#757684]">
            <p>© 2026 Life Site Operating System. All rights reserved.</p>
          </div>
        </div>
      </div>
    );
  }

  // Main Dashboard View
  const isEntranceHallPreview = layout === 'entrance-hall';

  return (
    <>
      {isEntranceHallPreview ? (
        <LifeSiteShell
          activeView={entranceHallView}
          onViewChange={handleEntranceHallViewChange}
          username={username || 'Explorer'}
          onReturnToClassic={handleReturnToClassic}
          isOffline={isOffline}
          refreshing={refreshing}
          onRefresh={triggerRefresh}
          onLogout={handleLogout}
          weather={dashboardData?.weather}
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          handleSearch={handleSearch}
          searchResults={searchResults}
          setSearchResults={setSearchResults}
          setSelectedNote={setSelectedNote}
          onClearSearch={clearSearch}
        >
          {/* Render the core presentational EntranceHallDashboard */}
          {entranceHallView === 'dashboard' && (
            <EntranceHallDashboard
              username={username}
              activeContext={activeTab}
              onContextChange={setActiveTab}
              events={filteredData?.calendarEvents || []}
              tasks={filteredData?.tasks || []}
              projects={todoistProjects}
              recentNotes={recentNotes.map(n => ({
                id: n.path,
                path: n.path,
                folder: n.path.split('/').slice(0, -1).join('/'),
                title: n.title,
                preview: n.preview,
                modifiedAt: n.modifiedAt
              }))}
              serviceStatus={dashboardData?.serviceStatus || []}
              lastUpdated={lastUpdated}
              refreshing={refreshing}
              isOffline={isOffline}
              onRefresh={triggerRefresh}
              onNavigate={handleEntranceHallViewChange}
              onOpenEvent={setSelectedEvent}
              onOpenTask={setSelectedTask}
              onOpenNote={(note) => {
                setSelectedNote({
                  ...note,
                  obsidianUri: settings?.obsidian?.vaultName 
                    ? `obsidian://open?vault=${encodeURIComponent(settings.obsidian.vaultName)}&file=${encodeURIComponent(note.path)}` 
                    : undefined
                });
              }}
            />
          )}

          {entranceHallView === 'calendar' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-xl border border-[#1e293b]/60 bg-gradient-to-r from-[#0d1527] to-[#0a0f1d] select-none">
                <div>
                  <span className="text-[10px] font-mono tracking-widest text-[#c5a86a] uppercase">Integrated Calendar</span>
                  <h1 className="text-2xl font-display font-black text-white tracking-wide uppercase mt-1">Calendar Workspace</h1>
                  <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
                    Manage your personal and professional google calendars, daily schedule hours, and agenda appointments in real-time.
                  </p>
                </div>
                <button
                  onClick={() => handleEntranceHallViewChange('dashboard')}
                  className="px-4 py-2.5 rounded-lg border border-[#c5a86a]/30 bg-[#0a0f1d] hover:border-[#e4cb93] text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-2 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#c5a86a]"
                >
                  <span>Back to Dashboard</span>
                </button>
              </div>

              <div className="life-site-entrance-hall">
                <CalendarPanel
                  activeTab={activeTab}
                  filteredData={filteredData}
                  googleCalendars={googleCalendars}
                  googleCalendarsLoading={googleCalendarsLoading}
                  activeSelectedCalendarIds={activeSelectedCalendarIds}
                  handleToggleCalendar={handleToggleCalendar}
                  handleSelectAllCalendars={handleSelectAllCalendars}
                  handleClearAllCalendars={handleClearAllCalendars}
                  calendarView={calendarView}
                  setCalendarView={setCalendarView}
                  currentCalendarDate={currentCalendarDate}
                  setCurrentCalendarDate={setCurrentCalendarDate}
                  setSelectedEvent={setSelectedEvent}
                  settings={settings}
                  onAddEventClick={() => {
                    setAddEventFormInitialDate(currentCalendarDate);
                    setAddEventFormInitialStartHour(undefined);
                    setShowAddEventForm(true);
                  }}
                  onSlotClick={(date, hour) => {
                    setAddEventFormInitialDate(date);
                    setAddEventFormInitialStartHour(hour);
                    setShowAddEventForm(true);
                  }}
                />
              </div>
            </div>
          )}

          {entranceHallView === 'tasks' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-xl border border-[#1e293b]/60 bg-gradient-to-r from-[#0d1527] to-[#0a0f1d] select-none text-left">
                <div>
                  <span className="text-[10px] font-mono tracking-widest text-[#c5a86a] uppercase">Mission-Critical Agenda</span>
                  <h1 className="text-2xl font-display font-black text-white tracking-wide uppercase mt-1">Tasks Workspace</h1>
                  <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
                    View today's priorities and manage your pull-system boards across your current workflows.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-left">
                  {/* Compact Context Selector */}
                  <div className="flex gap-1.5 p-1 bg-[#0a0f1d] border border-[#1e293b] rounded-lg">
                    {(['combined', 'personal', 'professional'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all duration-200 cursor-pointer outline-none ${
                          activeTab === tab
                            ? 'bg-[#c5a86a] text-[#070b13]'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => handleEntranceHallViewChange('dashboard')}
                    className="px-4 py-2.5 rounded-lg border border-[#c5a86a]/30 bg-[#0a0f1d] hover:border-[#e4cb93] text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-2 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#c5a86a]"
                  >
                    <span>Back to Dashboard</span>
                  </button>
                </div>
              </div>

              <div className="life-site-entrance-hall w-full">
                <TodoistTasksWorkspace
                  loading={loading}
                  isOffline={isOffline}
                  activeTab={activeTab}
                  dashboardData={dashboardData}
                  filteredData={filteredData}
                  todayTasks={todayTasks}
                  taskGroups={taskGroups}
                  sectionsData={sectionsData}
                  activeMobileSectionId={activeMobileSectionId}
                  selectedMobileSectionId={selectedMobileSectionId}
                  setSelectedMobileSectionId={setSelectedMobileSectionId}
                  isAddingTodayTask={isAddingTodayTask}
                  setIsAddingTodayTask={setIsAddingTodayTask}
                  todayTaskTitle={todayTaskTitle}
                  setTodayTaskTitle={setTodayTaskTitle}
                  todayTaskDesc={todayTaskDesc}
                  setTodayTaskDesc={setTodayTaskDesc}
                  todayTaskPriority={todayTaskPriority}
                  setTodayTaskPriority={setTodayTaskPriority}
                  todayTaskContext={todayTaskContext}
                  setTodayTaskContext={setTodayTaskContext}
                  todayTaskLoading={todayTaskLoading}
                  todayTaskError={todayTaskError}
                  submitTodayTask={submitTodayTask}
                  addingTaskForSectionId={addingTaskForSectionId}
                  setAddingTaskForSectionId={setAddingTaskForSectionId}
                  boardTaskTitle={boardTaskTitle}
                  setBoardTaskTitle={setBoardTaskTitle}
                  boardTaskDesc={boardTaskDesc}
                  setBoardTaskDesc={setBoardTaskDesc}
                  boardTaskPriority={boardTaskPriority}
                  setBoardTaskPriority={setBoardTaskPriority}
                  boardTaskContext={boardTaskContext}
                  setBoardTaskContext={setBoardTaskContext}
                  boardTaskLoading={boardTaskLoading}
                  boardTaskError={boardTaskError}
                  submitBoardTask={submitBoardTask}
                  toggleAddingTaskForSection={toggleAddingTaskForSection}
                  completingTaskIds={completingTaskIds}
                  justCompletedTaskIds={justCompletedTaskIds}
                  taskErrors={taskErrors}
                  activeCommentTaskId={activeCommentTaskId}
                  setActiveCommentTaskId={setActiveCommentTaskId}
                  taskComments={taskComments}
                  setTaskComments={setTaskComments}
                  commentSavingTaskIds={commentSavingTaskIds}
                  commentSuccessMessages={commentSuccessMessages}
                  setConfirmingCompleteTask={setConfirmingCompleteTask}
                  setSelectedTask={setSelectedTask}
                  setMovingTaskMenu={setMovingTaskMenu}
                  draggingTaskId={draggingTaskId}
                  dragOverColumnId={dragOverColumnId}
                  movingTaskIds={movingTaskIds}
                  canDrag={canDrag}
                  handleDragStart={handleDragStart}
                  handleDragEnd={handleDragEnd}
                  handleDragOver={handleDragOver}
                  handleDrop={handleDrop}
                  completedTasksExpanded={completedTasksExpanded}
                  setCompletedTasksExpanded={setCompletedTasksExpanded}
                  handleCompleteTask={handleCompleteTask}
                  handleAddComment={handleAddComment}
                  onRefresh={triggerRefresh}
                />
              </div>
            </div>
          )}

          {entranceHallView === 'projects' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-xl border border-[#1e293b]/60 bg-gradient-to-r from-[#0d1527] to-[#0a0f1d] select-none text-left">
                <div>
                  <span className="text-[10px] font-mono tracking-widest text-[#c5a86a] uppercase">Vanguard Projects</span>
                  <h1 className="text-2xl font-display font-black text-white tracking-wide uppercase mt-1">Projects Hub</h1>
                  <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
                    Explore your project hierarchies, track progress metrics, and complete tasks directly.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Compact Context Selector */}
                  <div className="flex gap-1.5 p-1 bg-[#0a0f1d] border border-[#1e293b] rounded-lg">
                    {(['combined', 'personal', 'professional'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all duration-200 cursor-pointer outline-none ${
                          activeTab === tab
                            ? 'bg-[#c5a86a] text-[#070b13]'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => handleEntranceHallViewChange('dashboard')}
                    className="px-4 py-2.5 rounded-lg border border-[#c5a86a]/30 bg-[#0a0f1d] hover:border-[#e4cb93] text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-2 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#c5a86a]"
                  >
                    <span>Back to Dashboard</span>
                  </button>
                </div>
              </div>

              <div className="life-site-entrance-hall max-w-5xl mx-auto">
                <TodoistProjectsPanel
                  loadingProjects={loadingProjects}
                  projectsError={projectsError}
                  todoistProjects={todoistProjects}
                  activeTab={activeTab}
                  fetchProjects={fetchProjects}
                  expandedProjectIds={expandedProjectIds}
                  projectTasks={projectTasks}
                  loadingProjectTasks={loadingProjectTasks}
                  projectTasksError={projectTasksError}
                  toggleProjectExpand={toggleProjectExpand}
                  completingTaskIds={completingTaskIds}
                  handleCompleteProjectTask={handleCompleteProjectTask}
                />
              </div>
            </div>
          )}

          {entranceHallView === 'notes' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-xl border border-[#1e293b]/60 bg-gradient-to-r from-[#0d1527] to-[#0a0f1d] select-none text-left">
                <div>
                  <span className="text-[10px] font-mono tracking-widest text-[#c5a86a] uppercase">VAULT REPOSITORY</span>
                  <h1 className="text-2xl font-display font-black text-white tracking-wide uppercase mt-1">Notes Inbox</h1>
                  <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
                    Captures, creates, appends and edits notes in your configured Obsidian vault.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Compact Context Selector */}
                  <div className="flex gap-1.5 p-1 bg-[#0a0f1d] border border-[#1e293b] rounded-lg">
                    {(['combined', 'personal', 'professional'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all duration-200 cursor-pointer outline-none ${
                          activeTab === tab
                            ? 'bg-[#c5a86a] text-[#070b13]'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => handleEntranceHallViewChange('dashboard')}
                    className="px-4 py-2.5 rounded-lg border border-[#c5a86a]/30 bg-[#0a0f1d] hover:border-[#e4cb93] text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-2 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#c5a86a]"
                  >
                    <span>Back to Dashboard</span>
                  </button>
                </div>
              </div>

              <div className="life-site-entrance-hall w-full">
                <ObsidianNotesInbox
                  settings={settings}
                  obsidianUrl={obsidianUrl}
                  obsidianApiKey={obsidianApiKey}
                  isOffline={isOffline}
                  activeTab={activeTab}
                  recentNotes={recentNotes}
                  recentNotesLoading={recentNotesLoading}
                  recentNotesError={recentNotesError}
                  recentNotesErrorDetails={recentNotesErrorDetails}
                  selectedRecentNote={selectedRecentNote}
                  setSelectedRecentNote={setSelectedRecentNote}
                  editedNoteContent={editedNoteContent}
                  setEditedNoteContent={setEditedNoteContent}
                  isSavingEditedNote={isSavingEditedNote}
                  saveNoteSuccess={saveNoteSuccess}
                  saveNoteError={saveNoteError}
                  saveNoteErrorDetails={saveNoteErrorDetails}
                  appendNoteContent={appendNoteContent}
                  setAppendNoteContent={setAppendNoteContent}
                  isAppendingNote={isAppendingNote}
                  appendNoteSuccess={appendNoteSuccess}
                  appendNoteError={appendNoteError}
                  appendNoteErrorDetails={appendNoteErrorDetails}
                  obsidianTitle={obsidianTitle}
                  setObsidianTitle={setObsidianTitle}
                  obsidianInput={obsidianInput}
                  setObsidianInput={setObsidianInput}
                  obsidianLoading={obsidianLoading}
                  obsidianSuccess={obsidianSuccess}
                  obsidianError={obsidianError}
                  obsidianErrorDetails={obsidianErrorDetails}
                  mobileHandoffStatus={mobileHandoffStatus}
                  obsidianMode={obsidianMode}
                  setObsidianMode={setObsidianMode}
                  obsidianContext={obsidianContext}
                  setObsidianContext={setObsidianContext}
                  isVoiceSupported={isVoiceSupported}
                  isListeningObsidian={isListeningObsidian}
                  toggleVoiceObsidian={toggleVoiceObsidian}
                  obsidianTitleRef={obsidianTitleRef}
                  notesInputRef={notesInputRef}
                  handleOpenRecentNote={handleOpenRecentNote}
                  handleSaveChanges={handleSaveChanges}
                  handleAppendToNote={handleAppendToNote}
                  submitObsidianNote={submitObsidianNote}
                  handleMobileSaveInObsidian={handleMobileSaveInObsidian}
                  handleMobileCopyNote={handleMobileCopyNote}
                  handleOpenObsidianAgain={handleOpenObsidianAgain}
                  handleClearSavedDraft={handleClearSavedDraft}
                  handleTitleKeyDown={handleTitleKeyDown}
                  getActiveObsidianMode={getActiveObsidianMode}
                  getAppendTargetFile={getAppendTargetFile}
                  getSelectedContext={getSelectedContext}
                />
              </div>
            </div>
          )}

          {entranceHallView === 'thought-catcher' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-xl border border-[#1e293b]/60 bg-gradient-to-r from-[#0d1527] to-[#0a0f1d] select-none">
                <div>
                  <span className="text-[10px] font-mono tracking-widest text-[#c5a86a] uppercase">Kinetic Stream</span>
                  <h1 className="text-2xl font-display font-black text-white tracking-wide uppercase mt-1">Thought Catcher</h1>
                  <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
                    Capture and cycle your streams of consciousness, transient ideas, and creative drafts into your local Obsidian vault.
                  </p>
                </div>
                <button
                  onClick={() => handleEntranceHallViewChange('dashboard')}
                  className="px-4 py-2.5 rounded-lg border border-[#c5a86a]/30 bg-[#0a0f1d] hover:border-[#e4cb93] text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-2 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#c5a86a]"
                >
                  <span>Back to Dashboard</span>
                </button>
              </div>

              {/* Inline Editor for Selected Recent Note */}
              {selectedRecentNote && (
                <div className="p-4 rounded-xl border border-[#00288e]/30 dark:border-[#a8b8ff]/30 bg-[#eaedff]/30 dark:bg-[#0c1322]/70 space-y-4 animate-fadeIn text-left">
                  <div className="flex justify-between items-center pb-2 border-b border-[#eaedff] dark:border-[#283044]">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-[#00288e] dark:text-[#a8b8ff]" />
                      <span className="font-display font-bold text-xs uppercase tracking-wider text-[#00288e] dark:text-[#a8b8ff] truncate max-w-[200px] md:max-w-[400px]">
                        Editing: {selectedRecentNote.title}
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setSelectedRecentNote(null)}
                      className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#757684]"
                      title="Close editor"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="entrance-hall-note-content-editor" className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
                      File Contents (Markdown)
                    </label>
                    <textarea
                      id="entrance-hall-note-content-editor"
                      value={editedNoteContent}
                      onChange={(e) => setEditedNoteContent(e.target.value)}
                      disabled={isSavingEditedNote}
                      className="w-full p-3 font-mono text-base md:text-xs border border-[#c4c5d5] dark:border-[#444653] rounded-lg bg-white dark:bg-[#0c1322] focus:outline-none focus:border-[#00288e] text-[#131b2e] dark:text-white leading-relaxed min-h-[8rem]"
                    />
                    
                    {saveNoteSuccess && (
                      <div className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 py-0.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Changes saved successfully to Obsidian vault!</span>
                      </div>
                    )}
                    {saveNoteError && (
                      <ObsidianErrorBox 
                        errorText={saveNoteError} 
                        techDetails={saveNoteErrorDetails}
                      />
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSaveChanges}
                        disabled={isSavingEditedNote || isAppendingNote}
                        className="bg-[#00288e] hover:bg-[#1e40af] disabled:opacity-50 text-white font-display text-[10px] font-bold uppercase tracking-wider py-2 px-4 rounded transition-colors cursor-pointer"
                      >
                        {isSavingEditedNote ? 'Saving...' : 'Save Changes'}
                      </button>
                      
                      <a
                        href={ObsidianClient.buildObsidianUri(settings?.obsidian?.vaultName || 'LifeVault', selectedRecentNote.path)}
                        className="inline-flex items-center gap-1 bg-[#faf8ff] hover:bg-[#eaedff] dark:bg-[#131b2e] dark:hover:bg-[#1a233a] text-[#131b2e] dark:text-white border border-[#eaedff] dark:border-[#283044] font-display text-[10px] font-bold uppercase tracking-wider py-2 px-4 rounded transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open in Obsidian</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => setSelectedRecentNote(null)}
                        disabled={isSavingEditedNote}
                        className="text-[#757684] hover:text-[#131b2e] dark:hover:text-white font-display text-[10px] font-bold uppercase tracking-wider py-2 px-3 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#eaedff] dark:border-[#283044] space-y-2">
                    <label htmlFor="entrance-hall-note-append-editor" className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
                      Append to Note
                    </label>
                    <textarea
                      id="entrance-hall-note-append-editor"
                      value={appendNoteContent}
                      onChange={(e) => setAppendNoteContent(e.target.value)}
                      disabled={isAppendingNote}
                      placeholder="Type material to append (will be separated by a blank line)..."
                      className="w-full p-3 text-base md:text-xs border border-[#c4c5d5] dark:border-[#444653] rounded-lg bg-white dark:bg-[#0c1322] focus:outline-none focus:border-[#00288e] text-[#131b2e] dark:text-white leading-relaxed min-h-[4rem]"
                    />

                    {appendNoteSuccess && (
                      <div className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 py-0.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Appended successfully to the note!</span>
                      </div>
                    )}
                    {appendNoteError && (
                      <ObsidianErrorBox 
                        errorText={appendNoteError} 
                        techDetails={appendNoteErrorDetails}
                      />
                    )}

                    <div>
                      <button
                        type="button"
                        onClick={handleAppendToNote}
                        disabled={isAppendingNote || isSavingEditedNote || !appendNoteContent.trim()}
                        className="bg-[#00288e] hover:bg-[#1e40af] disabled:opacity-40 text-white font-display text-[10px] font-bold uppercase tracking-wider py-2 px-4 rounded transition-colors cursor-pointer"
                      >
                        {isAppendingNote ? 'Appending...' : 'Append to Note'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="life-site-entrance-hall w-full">
                <div className="grid grid-cols-1 xl:grid-cols-5 h-full">
                  <div className="col-span-1 xl:col-span-5 h-full min-h-[500px]">
                    <ThoughtCatcher
                      mode={getActiveObsidianMode()}
                      baseUrl={obsidianUrl}
                      apiKey={obsidianApiKey}
                      vaultName={settings?.obsidian?.vaultName || 'LifeVault'}
                      folderName={DEFAULT_THOUGHT_CATCHER_FOLDER}
                      onOpenNote={handleOpenRecentNote}
                      isEditorOpen={selectedRecentNote !== null}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {entranceHallView === 'habits' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-xl border border-[#1e293b]/60 bg-gradient-to-r from-[#0d1527] to-[#0a0f1d] select-none">
                <div>
                  <span className="text-[10px] font-mono tracking-widest text-[#c5a86a] uppercase">Consistency Engine</span>
                  <h1 className="text-2xl font-display font-black text-white tracking-wide uppercase mt-1">Habits Workspace</h1>
                  <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
                    Track your daily commitments, consistency rates, performance streaks, and historical completions.
                  </p>
                </div>
                <button
                  onClick={() => handleEntranceHallViewChange('dashboard')}
                  className="px-4 py-2.5 rounded-lg border border-[#c5a86a]/30 bg-[#0a0f1d] hover:border-[#e4cb93] text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-2 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#c5a86a]"
                >
                  <span>Back to Dashboard</span>
                </button>
              </div>

              <div className="life-site-entrance-hall">
                <HabitPanel activeTab={activeTab} />
              </div>
            </div>
          )}

          {entranceHallView === 'settings' && (
            !settingsEditState ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 font-mono text-xs gap-3">
                <RefreshCw className="w-5 h-5 animate-spin text-[#c5a86a]" />
                <span>Loading system settings...</span>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-xl border border-[#1e293b]/60 bg-gradient-to-r from-[#0d1527] to-[#0a0f1d] select-none text-left">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#c5a86a] uppercase font-bold">SYSTEM CONTROLS</span>
                    <h1 className="text-2xl font-display font-black text-white tracking-wide uppercase mt-1">Settings Console</h1>
                    <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
                      These settings control the whole Life Site preferences, integrations, secrets, and view layouts.
                    </p>
                  </div>
                  <button
                    onClick={() => handleEntranceHallViewChange('dashboard')}
                    className="px-4 py-2.5 rounded-lg border border-[#c5a86a]/30 bg-[#0a0f1d] hover:border-[#e4cb93] text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-2 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#c5a86a]"
                  >
                    <span>Back to Dashboard</span>
                  </button>
                </div>

                <div className="bg-[#0a0f1d]/60 border border-[#1e293b]/60 rounded-xl p-6">
                  <SettingsWorkspace
                    settingsSection={settingsSection}
                    setSettingsSection={setSettingsSection}
                    settingsEditState={settingsEditState}
                    setSettingsEditState={setSettingsEditState}
                    saveSettingsSuccess={saveSettingsSuccess}
                    handleSaveSettings={handleSaveSettings}
                    connectionsStatus={connectionsStatus}
                    secretsForm={secretsForm}
                    setSecretsForm={setSecretsForm}
                    handleSaveConnections={handleSaveConnections}
                    handleRemoveTodoistToken={handleRemoveTodoistToken}
                    handleConnectGoogleCalendar={handleConnectGoogleCalendar}
                    getActiveObsidianMode={getActiveObsidianMode}
                    getObsidianStatusInfo={getObsidianStatusInfo}
                    obsidianUrl={obsidianUrl}
                    handleObsidianUrlChange={handleObsidianUrlChange}
                    obsidianApiKey={obsidianApiKey}
                    obsidianApiKeyInput={obsidianApiKeyInput}
                    handleObsidianApiKeyChange={handleObsidianApiKeyChange}
                    rememberObsidian={rememberObsidian}
                    handleRememberObsidianToggle={handleRememberObsidianToggle}
                    handleForgetObsidian={handleForgetObsidian}
                    obsidianTestStatus={obsidianTestStatus}
                    handleTestObsidianConnection={handleTestObsidianConnection}
                  />
                </div>
              </div>
            )
          )}
        </LifeSiteShell>
      ) : (
    <div className="min-h-screen bg-[#faf8ff] dark:bg-[#0c1322] text-[#131b2e] dark:text-[#faf8ff] font-sans transition-colors duration-300 relative pb-12 w-full max-w-full overflow-x-hidden min-w-0">
      
      {/* Background Blobs for Atmospheric Premium Design Layer */}
      <div className="blob bg-[#dbeafe] dark:bg-[#1e40af]/10 w-[600px] h-[600px] -top-96 -left-96"></div>
      <div className="blob bg-[#eaedff] dark:bg-[#273545]/10 w-[700px] h-[700px] -bottom-96 -right-96"></div>

      <GlobalHeader
        isOffline={isOffline}
        currentTime={currentTime}
        formattedBritishDate={formattedBritishDate}
        dashboardData={dashboardData}
        refreshing={refreshing}
        triggerRefresh={triggerRefresh}
        openSettings={openSettings}
        handleLogout={handleLogout}
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        handleSearch={handleSearch}
        searchResults={searchResults}
        setSearchResults={setSearchResults}
        setSelectedNote={setSelectedNote}
        onReturnToEntranceHall={handleReturnToEntranceHall}
        onClearSearch={clearSearch}
      />

      {/* Main Container Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-4 sm:mt-6 w-full min-w-0 max-w-full">
        
        {/* Context Switching Tabs (Phase 4.4) */}
        <ContextTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          lastUpdated={lastUpdated}
        />

        {/* Dashboard Panels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Today's Agenda - Calendar Integration (Full-Width Card, Phase 7) */}
          <CalendarPanel
            activeTab={activeTab}
            filteredData={filteredData}
            googleCalendars={googleCalendars}
            googleCalendarsLoading={googleCalendarsLoading}
            activeSelectedCalendarIds={activeSelectedCalendarIds}
            handleToggleCalendar={handleToggleCalendar}
            handleSelectAllCalendars={handleSelectAllCalendars}
            handleClearAllCalendars={handleClearAllCalendars}
            calendarView={calendarView}
            setCalendarView={setCalendarView}
            currentCalendarDate={currentCalendarDate}
            setCurrentCalendarDate={setCurrentCalendarDate}
            setSelectedEvent={setSelectedEvent}
            settings={settings}
            onAddEventClick={() => {
              setAddEventFormInitialDate(currentCalendarDate);
              setAddEventFormInitialStartHour(undefined);
              setShowAddEventForm(true);
            }}
            onSlotClick={(date, hour) => {
              setAddEventFormInitialDate(date);
              setAddEventFormInitialStartHour(hour);
              setShowAddEventForm(true);
            }}
          />

          {/* Habit Tracker Integration */}
          <HabitPanel activeTab={activeTab} />

          {/* DESIRED DESKTOP LAYOUT - Todoist Tasks (Full-width, Stage 2) */}
          <TodoistTasksWorkspace
            loading={loading}
            isOffline={isOffline}
            activeTab={activeTab}
            dashboardData={dashboardData}
            filteredData={filteredData}
            todayTasks={todayTasks}
            taskGroups={taskGroups}
            sectionsData={sectionsData}
            activeMobileSectionId={activeMobileSectionId}
            selectedMobileSectionId={selectedMobileSectionId}
            setSelectedMobileSectionId={setSelectedMobileSectionId}
            isAddingTodayTask={isAddingTodayTask}
            setIsAddingTodayTask={setIsAddingTodayTask}
            todayTaskTitle={todayTaskTitle}
            setTodayTaskTitle={setTodayTaskTitle}
            todayTaskDesc={todayTaskDesc}
            setTodayTaskDesc={setTodayTaskDesc}
            todayTaskPriority={todayTaskPriority}
            setTodayTaskPriority={setTodayTaskPriority}
            todayTaskContext={todayTaskContext}
            setTodayTaskContext={setTodayTaskContext}
            todayTaskLoading={todayTaskLoading}
            todayTaskError={todayTaskError}
            submitTodayTask={submitTodayTask}
            addingTaskForSectionId={addingTaskForSectionId}
            setAddingTaskForSectionId={setAddingTaskForSectionId}
            boardTaskTitle={boardTaskTitle}
            setBoardTaskTitle={setBoardTaskTitle}
            boardTaskDesc={boardTaskDesc}
            setBoardTaskDesc={setBoardTaskDesc}
            boardTaskPriority={boardTaskPriority}
            setBoardTaskPriority={setBoardTaskPriority}
            boardTaskContext={boardTaskContext}
            setBoardTaskContext={setBoardTaskContext}
            boardTaskLoading={boardTaskLoading}
            boardTaskError={boardTaskError}
            submitBoardTask={submitBoardTask}
            toggleAddingTaskForSection={toggleAddingTaskForSection}
            completingTaskIds={completingTaskIds}
            justCompletedTaskIds={justCompletedTaskIds}
            taskErrors={taskErrors}
            activeCommentTaskId={activeCommentTaskId}
            setActiveCommentTaskId={setActiveCommentTaskId}
            taskComments={taskComments}
            setTaskComments={setTaskComments}
            commentSavingTaskIds={commentSavingTaskIds}
            commentSuccessMessages={commentSuccessMessages}
            setConfirmingCompleteTask={setConfirmingCompleteTask}
            setSelectedTask={setSelectedTask}
            setMovingTaskMenu={setMovingTaskMenu}
            draggingTaskId={draggingTaskId}
            dragOverColumnId={dragOverColumnId}
            movingTaskIds={movingTaskIds}
            canDrag={canDrag}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
            completedTasksExpanded={completedTasksExpanded}
            setCompletedTasksExpanded={setCompletedTasksExpanded}
            handleCompleteTask={handleCompleteTask}
            handleAddComment={handleAddComment}
            onRefresh={triggerRefresh}
          />

          {/* DESIRED DESKTOP LAYOUT - Task Inbox and Todoist Projects Panels side-by-side (Stage 2) */}
          <div className="col-span-1 lg:col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch min-w-0">
            {/* LEFT COLUMN: Task Inbox */}
            <div className="flex flex-col min-h-0">
              {/* Task Inbox - Capture Panel (Phase 9) */}
              <section className="bg-white dark:bg-[#131b2e] rounded-xl border border-[#eaedff] dark:border-[#283044] shadow-sm p-4 sm:p-6 text-left flex flex-col min-h-0 lg:h-full">
            <div className="mb-4">
              <h3 className="font-display text-lg font-bold text-[#00288e] dark:text-white">TASK INBOX</h3>
              <p className="text-xs text-[#757684] mt-0.5">Quickly Add Tasks to Todoist (T)</p>
            </div>

            <form onSubmit={submitTodoistTask} className="space-y-4 flex-1 flex flex-col justify-between">
              {todoistSuccess && (
                <div className="bg-[#eaedff] dark:bg-[#273545]/60 text-[#00288e] dark:text-[#a8b8ff] p-2.5 rounded text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Task captured successfully into Todoist Inbox!</span>
                </div>
              )}
              {todoistError && (
                <div className="bg-[#ffdad6] text-[#ba1a1a] p-2.5 rounded text-xs font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{todoistError}</span>
                </div>
              )}

              <div className="relative mb-4 h-24 sm:h-28">
                <input
                  type="text"
                  ref={tasksInputRef}
                  value={todoistInput}
                  onChange={(e) => setTodoistInput(e.target.value)}
                  disabled={todoistLoading || isOffline}
                  className="w-full p-4 border border-[#c4c5d5] dark:border-[#444653] rounded-lg focus:outline-none focus:border-[#00288e] bg-[#faf8ff] dark:bg-[#0c1322]/40 text-[#131b2e] dark:text-white text-base md:text-xs h-full"
                  placeholder="Task title..."
                  required
                />
                
                {/* Voice Record Mic (Phase 15) */}
                <button
                  type="button"
                  onClick={toggleVoiceTodoist}
                  disabled={todoistLoading || isOffline || !isVoiceSupported}
                  className={`absolute right-4 bottom-4 p-2.5 rounded-full transition-colors ${
                    isListeningTodoist 
                      ? 'bg-[#ba1a1a] text-white animate-pulse' 
                      : 'bg-[#00288e] text-white hover:bg-[#1e40af]'
                  } disabled:opacity-30`}
                  title="Voice dictation input"
                >
                  {isListeningTodoist ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>

              {/* Combined contextual toggle row */}
              <div className="flex justify-between items-center gap-4">
                
                {/* Context Toggle (Phase 14) */}
                {activeTab === 'combined' ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold text-[#757684] uppercase tracking-wider font-display">Target:</span>
                    <div className="flex bg-[#faf8ff] dark:bg-[#0c1322] border border-[#eaedff] dark:border-[#283044]/80 rounded p-0.5 text-[9px]">
                      <button 
                        type="button" 
                        onClick={() => setTodoistContext('personal')}
                        className={`px-2 py-0.5 font-bold rounded ${todoistContext === 'personal' ? 'bg-[#00288e] text-white' : 'text-[#757684]'}`}
                      >
                        Personal
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setTodoistContext('professional')}
                        className={`px-2 py-0.5 font-bold rounded ${todoistContext === 'professional' ? 'bg-[#00288e] text-white' : 'text-[#757684]'}`}
                      >
                        Pro
                      </button>
                    </div>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-[#757684] uppercase tracking-wide">
                    Context: {activeTab}
                  </span>
                )}

                <button
                  type="submit"
                  disabled={todoistLoading || isOffline || !todoistInput.trim()}
                  className="bg-[#00288e] hover:bg-[#1e40af] disabled:bg-opacity-50 text-white font-display text-xs font-semibold tracking-wider uppercase py-2.5 px-6 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {todoistLoading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* RIGHT COLUMN: Todoist Projects Panel */}
        <TodoistProjectsPanel
          loadingProjects={loadingProjects}
          projectsError={projectsError}
          todoistProjects={todoistProjects}
          activeTab={activeTab}
          fetchProjects={fetchProjects}
          expandedProjectIds={expandedProjectIds}
          projectTasks={projectTasks}
          loadingProjectTasks={loadingProjectTasks}
          projectTasksError={projectTasksError}
          toggleProjectExpand={toggleProjectExpand}
          completingTaskIds={completingTaskIds}
          handleCompleteProjectTask={handleCompleteProjectTask}
        />
      </div>

        {/* Responsive Grid wrapping Notes Inbox and Thought Catcher */}
        <div className="col-span-1 lg:col-span-12 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* Notes Inbox - Capture Panel (Phase 12 Redesigned for Obsidian) */}
          <ObsidianNotesInbox
            settings={settings}
            obsidianUrl={obsidianUrl}
            obsidianApiKey={obsidianApiKey}
            isOffline={isOffline}
            activeTab={activeTab}
            recentNotes={recentNotes}
            recentNotesLoading={recentNotesLoading}
            recentNotesError={recentNotesError}
            recentNotesErrorDetails={recentNotesErrorDetails}
            selectedRecentNote={selectedRecentNote}
            setSelectedRecentNote={setSelectedRecentNote}
            editedNoteContent={editedNoteContent}
            setEditedNoteContent={setEditedNoteContent}
            isSavingEditedNote={isSavingEditedNote}
            saveNoteSuccess={saveNoteSuccess}
            saveNoteError={saveNoteError}
            saveNoteErrorDetails={saveNoteErrorDetails}
            appendNoteContent={appendNoteContent}
            setAppendNoteContent={setAppendNoteContent}
            isAppendingNote={isAppendingNote}
            appendNoteSuccess={appendNoteSuccess}
            appendNoteError={appendNoteError}
            appendNoteErrorDetails={appendNoteErrorDetails}
            obsidianTitle={obsidianTitle}
            setObsidianTitle={setObsidianTitle}
            obsidianInput={obsidianInput}
            setObsidianInput={setObsidianInput}
            obsidianLoading={obsidianLoading}
            obsidianSuccess={obsidianSuccess}
            obsidianError={obsidianError}
            obsidianErrorDetails={obsidianErrorDetails}
            mobileHandoffStatus={mobileHandoffStatus}
            obsidianMode={obsidianMode}
            setObsidianMode={setObsidianMode}
            obsidianContext={obsidianContext}
            setObsidianContext={setObsidianContext}
            isVoiceSupported={isVoiceSupported}
            isListeningObsidian={isListeningObsidian}
            toggleVoiceObsidian={toggleVoiceObsidian}
            obsidianTitleRef={obsidianTitleRef}
            notesInputRef={notesInputRef}
            handleOpenRecentNote={handleOpenRecentNote}
            handleSaveChanges={handleSaveChanges}
            handleAppendToNote={handleAppendToNote}
            submitObsidianNote={submitObsidianNote}
            handleMobileSaveInObsidian={handleMobileSaveInObsidian}
            handleMobileCopyNote={handleMobileCopyNote}
            handleOpenObsidianAgain={handleOpenObsidianAgain}
            handleClearSavedDraft={handleClearSavedDraft}
            handleTitleKeyDown={handleTitleKeyDown}
            getActiveObsidianMode={getActiveObsidianMode}
            getAppendTargetFile={getAppendTargetFile}
            getSelectedContext={getSelectedContext}
          />

          {/* Thought Catcher - Capturing streams of thoughts */}
          <div className="col-span-1 xl:col-span-5 h-full">
            <ThoughtCatcher
              mode={getActiveObsidianMode()}
              baseUrl={obsidianUrl}
              apiKey={obsidianApiKey}
              vaultName={settings?.obsidian?.vaultName || 'LifeVault'}
              folderName={DEFAULT_THOUGHT_CATCHER_FOLDER}
              onOpenNote={handleOpenRecentNote}
              isEditorOpen={selectedRecentNote !== null}
            />
          </div>
        </div>



        </div>
      </div>
    </div>
      )}

      <AppOverlays
        selectedEvent={selectedEvent}
        onCloseSelectedEvent={() => setSelectedEvent(null)}
        onSuccessSelectedEvent={async () => {
          setSelectedEvent(null);
          await triggerRefresh();
          await loadCalendarsList();
        }}
        selectedTask={selectedTask}
        onCloseSelectedTask={() => setSelectedTask(null)}
        todoistProjects={dashboardData?.todoistProjects || []}
        todoistSections={dashboardData?.todoistSections || []}
        onSaveTaskDetails={handleSaveTaskDetails}
        onMoveTask={handleMoveTask}
        isOffline={isOffline}
        movingTaskMenu={movingTaskMenu}
        onCloseMovingTaskMenu={() => setMovingTaskMenu(null)}
        todoistInboxProjectId={dashboardData?.todoistInboxProjectId}
        showAddEventForm={showAddEventForm}
        onCloseAddEventForm={() => setShowAddEventForm(false)}
        googleCalendars={googleCalendars}
        connectionsStatus={connectionsStatus}
        addEventFormInitialDate={addEventFormInitialDate}
        addEventFormInitialStartHour={addEventFormInitialStartHour}
        onSuccessAddEventForm={async () => {
          setShowAddEventForm(false);
          await triggerRefresh();
          await loadCalendarsList();
        }}
        confirmingCompleteTask={confirmingCompleteTask}
        onCloseConfirmingCompleteTask={() => setConfirmingCompleteTask(null)}
        onCompleteTask={handleCompleteTask}
        selectedNote={selectedNote}
        onCloseSelectedNote={() => setSelectedNote(null)}
        showStartupSummary={showStartupSummary}
        onCloseStartupSummary={() => setShowStartupSummary(false)}
        startupStats={startupStats}
        username={username || 'Explorer'}
        showSettings={showSettings}
        onCloseSettings={() => setShowSettings(false)}
        settingsSection={settingsSection}
        setSettingsSection={setSettingsSection}
        settingsEditState={settingsEditState}
        setSettingsEditState={setSettingsEditState}
        saveSettingsSuccess={saveSettingsSuccess}
        handleSaveSettings={handleSaveSettings}
        secretsForm={secretsForm}
        setSecretsForm={setSecretsForm}
        handleSaveConnections={handleSaveConnections}
        handleRemoveTodoistToken={handleRemoveTodoistToken}
        handleConnectGoogleCalendar={handleConnectGoogleCalendar}
        getActiveObsidianMode={getActiveObsidianMode}
        getObsidianStatusInfo={getObsidianStatusInfo}
        obsidianUrl={obsidianUrl}
        handleObsidianUrlChange={handleObsidianUrlChange}
        obsidianApiKey={obsidianApiKey}
        obsidianApiKeyInput={obsidianApiKeyInput}
        handleObsidianApiKeyChange={handleObsidianApiKeyChange}
        rememberObsidian={rememberObsidian}
        handleRememberObsidianToggle={handleRememberObsidianToggle}
        handleForgetObsidian={handleForgetObsidian}
        obsidianTestStatus={obsidianTestStatus}
        handleTestObsidianConnection={handleTestObsidianConnection}
      />

    </>
  );
}
