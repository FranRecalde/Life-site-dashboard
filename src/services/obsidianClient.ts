import type { ObsidianNote } from '../types';

export interface ObsidianNoteDetail {
  path: string;
  title: string;
  content: string;
  modifiedAt: string;
  preview: string;
}

export interface ObsidianSearchFolder {
  path: string;
  context: 'personal' | 'professional' | 'favorite';
}

export type ObsidianGlobalSearchResult =
  | { kind: 'notes'; notes: ObsidianNote[] }
  | { kind: 'mobile-handoff'; uri: string };

export class ObsidianApiError extends Error {
  status?: number;
  method?: string;
  url?: string;
  responseBody?: string;

  constructor(message: string, status?: number, method?: string, url?: string, responseBody?: string) {
    super(message);
    this.name = 'ObsidianApiError';
    this.status = status;
    this.method = method;
    this.url = url;
    this.responseBody = responseBody;
  }
}

export class ObsidianClient {
  static cleanBaseUrl(url: string): string {
    let clean = url.trim();
    // Remove trailing slashes
    clean = clean.replace(/\/+$/, '');
    // Remove accidental trailing paths like /mcp, /mcp/, /vault, /vault/
    clean = clean.replace(/\/mcp$/i, '');
    clean = clean.replace(/\/vault$/i, '');
    clean = clean.replace(/\/+$/, ''); // clean trailing slashes again
    return clean;
  }

  private static async request(
    baseUrl: string,
    apiKey: string,
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const cleanBase = this.cleanBaseUrl(baseUrl);
    const cleanPath = path.replace(/^\//, '');
    const url = `${cleanBase}/${cleanPath}`;

    // Clean API Key
    let cleanedKey = apiKey.trim().replace(/\r?\n|\r/g, '');
    if (cleanedKey.toLowerCase().startsWith('bearer ')) {
      cleanedKey = cleanedKey.substring(7).trim();
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${cleanedKey}`,
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    const method = options.method || 'GET';

    try {
      const res = await fetch(url, {
        ...options,
        headers
      });

      if (process.env.NODE_ENV !== 'production') {
        const safeLogUrl = cleanPath.startsWith('search/simple/')
          ? `${cleanBase}/search/simple/?query=[redacted]`
          : url;
        console.log(`HTTP Method: ${method}`);
        console.log(`Final Request URL: ${safeLogUrl}`);
        console.log(`Response Status: ${res.status}`);
      }

      if (!res.ok) {
        let responseBody = '';
        try {
          responseBody = await res.text();
        } catch {
          // Ignore
        }
        throw new ObsidianApiError(
          `Obsidian REST API returned status: ${res.status} ${res.statusText}`,
          res.status,
          method,
          url,
          responseBody
        );
      }

      return res;
    } catch (err: any) {
      if (err instanceof ObsidianApiError) {
        throw err;
      }
      // This is a network/browser connection error (Failed to fetch)
      throw new ObsidianApiError(
        err.message || 'Network error',
        undefined,
        method,
        url,
        undefined
      );
    }
  }

  static async testConnection(baseUrl: string, apiKey: string): Promise<boolean> {
    try {
      const cleanBase = this.cleanBaseUrl(baseUrl);
      // Step 1: Health check (Availability)
      const healthRes = await fetch(`${cleanBase}/`, { method: 'GET' });
      
      // Step 2: Auth check
      let cleanedKey = apiKey.trim().replace(/\r?\n|\r/g, '');
      if (cleanedKey.toLowerCase().startsWith('bearer ')) {
        cleanedKey = cleanedKey.substring(7).trim();
      }

      const vaultRes = await fetch(`${cleanBase}/vault/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cleanedKey}`,
          'Accept': 'application/json'
        }
      });
      return vaultRes.status === 200;
    } catch {
      return false;
    }
  }

  static safeDecode(val: string): string {
    if (!val) return '';
    try {
      return decodeURIComponent(val);
    } catch {
      return val;
    }
  }

  static normalizeVaultPath(filePath: string, folderName?: string): string {
    if (!filePath) {
      throw new Error("Empty path");
    }

    // Decode to prevent double encoding
    let decoded = this.safeDecode(filePath);

    // Convert Windows backslashes to forward slashes
    decoded = decoded.replace(/\\/g, '/');

    // Split and filter out empty and traversal segments
    const segments = decoded.split('/').map(s => s.trim()).filter(s => s && s !== '..');

    if (segments.length === 0) {
      throw new Error("Invalid or empty path");
    }

    let finalPath = segments.join('/');

    if (folderName) {
      let decodedFolder = this.safeDecode(folderName).replace(/\\/g, '/');
      const folderSegments = decodedFolder.split('/').map(s => s.trim()).filter(s => s && s !== '..');
      
      if (folderSegments.length > 0) {
        // Check if the first segments of finalPath exactly match folderSegments
        let alreadyPrefixed = true;
        if (segments.length >= folderSegments.length) {
          for (let i = 0; i < folderSegments.length; i++) {
            if (segments[i] !== folderSegments[i]) {
              alreadyPrefixed = false;
              break;
            }
          }
        } else {
          alreadyPrefixed = false;
        }

        if (!alreadyPrefixed) {
          finalPath = [...folderSegments, ...segments].join('/');
        }
      }
    }

    return finalPath;
  }

  static encodeVaultPath(path: string): string {
    const decoded = this.safeDecode(path);
    return decoded
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');
  }

  static normalizeEntry(entry: any, folderName: string): { name: string; relativePath: string; fullVaultPath: string } {
    let name = '';
    let pathField = '';

    if (typeof entry === 'string') {
      pathField = entry;
      const parts = entry.split('/');
      name = parts[parts.length - 1];
    } else if (entry && typeof entry === 'object') {
      name = entry.name || entry.filename || '';
      pathField = entry.path || entry.relativePath || entry.filepath || '';
      if (!name && pathField) {
        name = pathField.split('/').pop() || '';
      }
    }

    const fullVaultPath = this.normalizeVaultPath(pathField || name, folderName);
    const relativePath = fullVaultPath;

    return {
      name,
      relativePath,
      fullVaultPath
    };
  }

  static async listFilesInFolder(baseUrl: string, apiKey: string, folderName: string): Promise<{ name: string; relativePath: string; fullVaultPath: string }[]> {
    const cleanFolder = this.normalizeVaultPath(folderName);
    // Ensure trailing slash for folder request
    const folderPath = cleanFolder ? `${cleanFolder}/` : '';
    const encodedPath = this.encodeVaultPath(folderPath);
    const urlPath = `vault/${encodedPath}`;

    const response = await this.request(baseUrl, apiKey, urlPath, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    let entries: any[] = [];
    if (data && Array.isArray(data.files)) {
      entries = data.files;
    } else if (Array.isArray(data)) {
      entries = data;
    } else if (data && typeof data === 'object') {
      const arrayKey = Object.keys(data).find(k => Array.isArray((data as any)[k]));
      if (arrayKey) {
        entries = (data as any)[arrayKey];
      }
    }

    const normalized = entries.map(entry => this.normalizeEntry(entry, folderName));

    if (process.env.NODE_ENV !== 'production') {
      console.log('Configured folder:', folderName);
      entries.slice(0, 3).forEach(entry => {
        console.log('Raw folder-list entry:', JSON.stringify(entry));
        try {
          const norm = this.normalizeEntry(entry, folderName);
          console.log('Normalised file path:', norm.fullVaultPath);
        } catch (e) {}
      });
    }

    // Only return markdown files
    return normalized.filter(item => item.name.toLowerCase().endsWith('.md'));
  }

  static async readFile(baseUrl: string, apiKey: string, filePath: string): Promise<{ content: string; lastModified: string }> {
    const cleanPath = this.normalizeVaultPath(filePath);
    const encodedPath = this.encodeVaultPath(cleanPath);
    const urlPath = `vault/${encodedPath}`;

    if (process.env.NODE_ENV !== 'production') {
      const segments = cleanPath.split('/');
      const folder = segments.length > 1 ? segments.slice(0, -1).join('/') : '';
      console.log('Configured folder:\n' + (folder || 'None'));
      console.log('Normalised file path:\n' + cleanPath);
      console.log('Final file request:\n' + `${this.cleanBaseUrl(baseUrl)}/${urlPath}`);
    }

    const response = await this.request(baseUrl, apiKey, urlPath, {
      method: 'GET',
      headers: {
        'Accept': 'text/markdown, text/plain, application/json'
      }
    });

    const content = await response.text();
    const lastModifiedHeader = response.headers.get('last-modified');
    const lastModified = lastModifiedHeader 
      ? new Date(lastModifiedHeader).toISOString() 
      : new Date().toISOString();

    return { content, lastModified };
  }

  static async checkFileExists(baseUrl: string, apiKey: string, filePath: string): Promise<boolean> {
    const cleanPath = this.normalizeVaultPath(filePath);
    const encodedPath = this.encodeVaultPath(cleanPath);
    const urlPath = `vault/${encodedPath}`;

    if (process.env.NODE_ENV !== 'production') {
      const segments = cleanPath.split('/');
      const folder = segments.length > 1 ? segments.slice(0, -1).join('/') : '';
      console.log('Configured folder:\n' + (folder || 'None'));
      console.log('Normalised file path:\n' + cleanPath);
      console.log('Final file request:\n' + `${this.cleanBaseUrl(baseUrl)}/${urlPath}`);
    }

    try {
      await this.request(baseUrl, apiKey, urlPath, {
        method: 'GET'
      });
      return true;
    } catch {
      return false;
    }
  }

  static async createFile(baseUrl: string, apiKey: string, filePath: string, content: string): Promise<void> {
    const cleanPath = this.normalizeVaultPath(filePath);
    const encodedPath = this.encodeVaultPath(cleanPath);
    const urlPath = `vault/${encodedPath}`;

    if (process.env.NODE_ENV !== 'production') {
      const segments = cleanPath.split('/');
      const folder = segments.length > 1 ? segments.slice(0, -1).join('/') : '';
      console.log('Configured folder:\n' + (folder || 'None'));
      console.log('Normalised file path:\n' + cleanPath);
      console.log('Final file request:\n' + `${this.cleanBaseUrl(baseUrl)}/${urlPath}`);
    }

    await this.request(baseUrl, apiKey, urlPath, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/markdown'
      },
      body: content
    });
  }

  static async replaceFile(baseUrl: string, apiKey: string, filePath: string, content: string): Promise<void> {
    const cleanPath = this.normalizeVaultPath(filePath);
    const encodedPath = this.encodeVaultPath(cleanPath);
    const urlPath = `vault/${encodedPath}`;

    if (process.env.NODE_ENV !== 'production') {
      const segments = cleanPath.split('/');
      const folder = segments.length > 1 ? segments.slice(0, -1).join('/') : '';
      console.log('Configured folder:\n' + (folder || 'None'));
      console.log('Normalised file path:\n' + cleanPath);
      console.log('Final file request:\n' + `${this.cleanBaseUrl(baseUrl)}/${urlPath}`);
    }

    await this.request(baseUrl, apiKey, urlPath, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/markdown'
      },
      body: content
    });
  }

  static async appendToFile(baseUrl: string, apiKey: string, filePath: string, content: string): Promise<void> {
    const cleanPath = this.normalizeVaultPath(filePath);
    const encodedPath = this.encodeVaultPath(cleanPath);
    const urlPath = `vault/${encodedPath}`;

    if (process.env.NODE_ENV !== 'production') {
      const segments = cleanPath.split('/');
      const folder = segments.length > 1 ? segments.slice(0, -1).join('/') : '';
      console.log('Configured folder:\n' + (folder || 'None'));
      console.log('Normalised file path:\n' + cleanPath);
      console.log('Final file request:\n' + `${this.cleanBaseUrl(baseUrl)}/${urlPath}`);
    }

    await this.request(baseUrl, apiKey, urlPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/markdown'
      },
      body: content
    });
  }

  static buildObsidianUri(vaultName: string, filePath: string): string {
    const params = new URLSearchParams();
    params.append('vault', vaultName);
    params.append('file', filePath);
    return `obsidian://open?${params.toString()}`;
  }

  static buildObsidianNewNoteUri(vaultName: string, folder: string, fileName: string, content: string): string {
    const cleanFolder = this.normalizeVaultPath(folder);
    const fullPath = cleanFolder ? `${cleanFolder}/${fileName}` : fileName;
    const params = new URLSearchParams();
    params.append('vault', vaultName);
    params.append('file', fullPath);
    params.append('content', content);
    return `obsidian://new?${params.toString()}`;
  }

  static buildObsidianAppendNoteUri(vaultName: string, filePath: string, content: string): string {
    const cleanPath = this.normalizeVaultPath(filePath);
    const params = new URLSearchParams();
    params.append('vault', vaultName);
    params.append('file', cleanPath);
    // Add two newline characters before appended content so separate captures do not run together
    params.append('content', `\n\n${content}`);
    params.append('append', 'true');
    return `obsidian://new?${params.toString()}`;
  }

  static buildObsidianOpenVaultUri(vaultName: string): string {
    const params = new URLSearchParams();
    params.append('vault', vaultName);
    return `obsidian://open?${params.toString()}`;
  }

  static buildObsidianSearchUri(vaultName: string, query: string): string {
    const params = new URLSearchParams();
    params.append('vault', vaultName);
    params.append('query', query);
    return `obsidian://search?${params.toString()}`;
  }

  private static normalizeSearchPath(rawPath: string): string | null {
    let decodedPath = rawPath;
    const seenPaths = new Set<string>();
    let stable = false;

    // Each successful URI decode must shorten the input. Using the original
    // length as the guard therefore covers every representable encoding layer
    // without allowing malformed input to loop indefinitely.
    for (let remaining = rawPath.length + 1; remaining > 0; remaining -= 1) {
      if (seenPaths.has(decodedPath)) {
        return null;
      }
      seenPaths.add(decodedPath);

      const decoded = this.safeDecode(decodedPath);
      if (decoded === decodedPath) {
        stable = true;
        break;
      }
      if (decoded.length >= decodedPath.length) {
        return null;
      }
      decodedPath = decoded;
    }

    if (!stable) {
      return null;
    }

    decodedPath = decodedPath.replace(/\\/g, '/');

    if (decodedPath.startsWith('/') || /^[a-z]:\//i.test(decodedPath)) {
      return null;
    }

    const segments = decodedPath.split('/').map(segment => segment.trim());
    if (segments.some(segment => segment === '.' || segment === '..')) {
      return null;
    }

    try {
      return this.normalizeVaultPath(decodedPath);
    } catch {
      return null;
    }
  }

  static async searchGlobalNotes(
    baseUrl: string,
    apiKey: string,
    vaultName: string,
    query: string,
    permittedFolders: ObsidianSearchFolder[],
    mode: 'desktop' | 'mobile'
  ): Promise<ObsidianGlobalSearchResult> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return { kind: 'notes', notes: [] };
    }

    if (mode === 'mobile') {
      return {
        kind: 'mobile-handoff',
        uri: this.buildObsidianSearchUri(vaultName, cleanQuery)
      };
    }

    const normalizedFolders = permittedFolders
      .flatMap(folder => {
        const path = this.normalizeSearchPath(folder.path);
        return path ? [{ path, context: folder.context }] : [];
      })
      .filter((folder, index, folders) => (
        folders.findIndex(candidate => candidate.path.toLowerCase() === folder.path.toLowerCase()) === index
      ))
      .sort((a, b) => b.path.length - a.path.length);

    if (normalizedFolders.length === 0) {
      return { kind: 'notes', notes: [] };
    }

    const params = new URLSearchParams();
    params.append('query', cleanQuery);
    params.append('contextLength', '160');
    const searchPath = `search/simple/?${params.toString()}`;
    const response = await this.request(baseUrl, apiKey, searchPath, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new ObsidianApiError(
        'Obsidian search returned an unexpected response.',
        response.status,
        'POST'
      );
    }

    const seenPaths = new Set<string>();
    const allowedMatches = data.flatMap((result: any) => {
      if (!result || typeof result.filename !== 'string') {
        return [];
      }

      const notePath = this.normalizeSearchPath(result.filename);
      if (!notePath) {
        return [];
      }

      if (!notePath.toLowerCase().endsWith('.md')) {
        return [];
      }

      const lowerPath = notePath.toLowerCase();
      const folder = normalizedFolders.find(candidate => (
        lowerPath.startsWith(`${candidate.path.toLowerCase()}/`)
      ));
      if (!folder || seenPaths.has(lowerPath)) {
        return [];
      }
      seenPaths.add(lowerPath);

      const matchContext = Array.isArray(result.matches)
        ? result.matches.find((match: any) => typeof match?.context === 'string')?.context
        : undefined;

      return [{ notePath, folder, matchContext }];
    });

    const notes = await Promise.all(allowedMatches.map(async ({ notePath, folder, matchContext }) => {
      const file = await this.readFile(baseUrl, apiKey, notePath);
      return {
        id: notePath,
        title: this.getTitleFromPath(notePath),
        path: notePath,
        folder: folder.path,
        modifiedAt: file.lastModified,
        preview: matchContext
          ? this.cleanPreviewText(matchContext)
          : this.cleanPreviewText(file.content),
        context: folder.context,
        obsidianUri: this.buildObsidianUri(vaultName, notePath)
      } satisfies ObsidianNote;
    }));

    return { kind: 'notes', notes };
  }

  static cleanFileName(title: string): string {
    let cleaned = title.trim();
    // Remove .md extension
    if (cleaned.toLowerCase().endsWith('.md')) {
      cleaned = cleaned.substring(0, cleaned.length - 3).trim();
    }
    // Remove unsafe filename characters.
    // Unsafe characters in filenames for Obsidian / OS are: \ / : * ? " < > | [ ] # ^
    cleaned = cleaned.replace(/[\\/:*?"<>|[\]#^]/g, '');
    return cleaned.trim();
  }

  static generateUniqueBaseName(content: string): string {
    const now = new Date();
    const pad = (num: number) => String(num).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}`;

    // Clean first line
    const firstLine = content.split('\n')[0] || '';
    const cleanLine = firstLine
      .replace(/[#*`_\[\]()]/g, '') // remove markdown characters
      .replace(/[\\/:*?"<>|]/g, '')  // remove forbidden filename characters
      .trim();

    // Extract first 5-6 words
    const words = cleanLine.split(/\s+/).filter(w => w.length > 0).slice(0, 6).join(' ');
    const titlePart = words.substring(0, 40).trim();

    return titlePart 
      ? `${dateStr} ${timeStr} ${titlePart}` 
      : `${dateStr} ${timeStr}`;
  }

  static cleanPreviewText(content: string): string {
    return content
      .replace(/#+ [^\n]+/g, '') // remove headings
      .replace(/[\*\`\_\[\]\(\)]/g, '') // remove markdown tags
      .trim()
      .substring(0, 160) + (content.length > 160 ? '...' : '');
  }

  static getTitleFromPath(filePath: string): string {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.md$/i, '');
  }

  static async getRecentNotes(baseUrl: string, apiKey: string, folderName: string): Promise<ObsidianNoteDetail[]> {
    // 1. List files
    const entries = await this.listFilesInFolder(baseUrl, apiKey, folderName);
    if (entries.length === 0) {
      return [];
    }

    // 2. Fetch metadata (GET) in parallel to get modification times
    const filesWithDates = await Promise.all(
      entries.map(async (item) => {
        try {
          const cleanPath = this.normalizeVaultPath(item.fullVaultPath);
          const encodedPath = this.encodeVaultPath(cleanPath);
          const urlPath = `vault/${encodedPath}`;
          
          if (process.env.NODE_ENV !== 'production') {
            console.log('Configured folder:\n' + folderName);
            console.log('Normalised file path:\n' + cleanPath);
            console.log('Final file request:\n' + `${this.cleanBaseUrl(baseUrl)}/${urlPath}`);
          }

          // Use authenticated GET request instead of HEAD
          const res = await this.request(baseUrl, apiKey, urlPath, {
            method: 'GET'
          });
          const lastModifiedHeader = res.headers.get('last-modified');
          const modifiedAt = lastModifiedHeader ? new Date(lastModifiedHeader).getTime() : Date.now();
          const content = await res.text();
          return { item, modifiedAt, content };
        } catch {
          return { item, modifiedAt: 0, content: '' };
        }
      })
    );

    // 3. Sort by modification time desc and take top 3
    const top3 = filesWithDates
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
      .slice(0, 3);

    // 4. Fetch full content or use pre-fetched content for only these top 3 files
    const recentNotes = await Promise.all(
      top3.map(async (x) => {
        let content = x.content;
        let lastModified = new Date(x.modifiedAt).toISOString();
        
        if (!content && x.modifiedAt === 0) {
          try {
            const fileData = await this.readFile(baseUrl, apiKey, x.item.fullVaultPath);
            content = fileData.content;
            lastModified = fileData.lastModified;
          } catch {
            content = '';
            lastModified = new Date().toISOString();
          }
        }
        
        const title = this.getTitleFromPath(x.item.fullVaultPath);
        const preview = this.cleanPreviewText(content);
        return {
          path: x.item.fullVaultPath,
          title,
          content,
          modifiedAt: lastModified,
          preview
        };
      })
    );

    // Sort the final detailed notes by modification date (newest first)
    return recentNotes.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  }
}
