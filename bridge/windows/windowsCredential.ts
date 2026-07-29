import { spawn } from 'node:child_process';
import path from 'node:path';

const CREDENTIAL_TARGET_PATTERN = /^[\x20-\x7e]{1,256}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,512}$/;
const MAX_CREDENTIAL_BYTES = 4 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

const READ_GENERIC_CREDENTIAL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class LifeSiteCredentialReader
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL
    {
        public UInt32 Flags;
        public UInt32 Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(
        string target,
        UInt32 type,
        UInt32 flags,
        out IntPtr credential
    );

    [DllImport("Advapi32.dll", SetLastError = true)]
    private static extern void CredFree(IntPtr buffer);

    public static byte[] Read(string target)
    {
        IntPtr pointer;
        if (!CredRead(target, 1, 0, out pointer))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }

        try
        {
            CREDENTIAL credential =
                (CREDENTIAL)Marshal.PtrToStructure(pointer, typeof(CREDENTIAL));
            byte[] value = new byte[credential.CredentialBlobSize];
            if (value.Length > 0)
            {
                Marshal.Copy(credential.CredentialBlob, value, 0, value.Length);
            }
            return value;
        }
        finally
        {
            CredFree(pointer);
        }
    }
}
'@

$credentialBytes = [LifeSiteCredentialReader]::Read(
    $env:LIFE_SITE_BRIDGE_CREDENTIAL_TARGET
)
try {
    [Console]::OpenStandardOutput().Write(
        $credentialBytes,
        0,
        $credentialBytes.Length
    )
}
finally {
    [Array]::Clear($credentialBytes, 0, $credentialBytes.Length)
}
`;

export type WindowsCredentialErrorCode =
  | 'CREDENTIAL_INVALID'
  | 'CREDENTIAL_UNAVAILABLE'
  | 'INVALID_CREDENTIAL_TARGET'
  | 'UNSUPPORTED_PLATFORM';

export class WindowsCredentialError extends Error {
  constructor(readonly code: WindowsCredentialErrorCode) {
    super(code);
    this.name = 'WindowsCredentialError';
  }
}

export interface CredentialCommand {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  windowsHide: true;
  maxOutputBytes: number;
}

export type CredentialCommandRunner = (
  command: CredentialCommand,
) => Promise<Buffer>;

function validateCredentialTarget(value: string): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    !CREDENTIAL_TARGET_PATTERN.test(value)
  ) {
    throw new WindowsCredentialError('INVALID_CREDENTIAL_TARGET');
  }
  return value;
}

function defaultPowerShellPath(env: NodeJS.ProcessEnv): string {
  const windowsRoot = env.SystemRoot ?? env.WINDIR;
  if (!windowsRoot) {
    throw new WindowsCredentialError('CREDENTIAL_UNAVAILABLE');
  }
  return path.win32.join(
    windowsRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
}

function safePowerShellEnvironment(
  source: NodeJS.ProcessEnv,
  credentialTarget: string,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {
    LIFE_SITE_BRIDGE_CREDENTIAL_TARGET: credentialTarget,
  };
  for (const key of [
    'ComSpec',
    'LOCALAPPDATA',
    'PSModulePath',
    'SystemRoot',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'WINDIR',
  ]) {
    if (source[key]) result[key] = source[key];
  }
  return result;
}

export const runCredentialCommand: CredentialCommandRunner = (
  command,
) => new Promise<Buffer>((resolve, reject) => {
  const child = spawn(command.executable, command.args, {
    env: command.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: command.windowsHide,
  });
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let settled = false;
  const timer = setTimeout(() => {
    child.kill();
    finish(new WindowsCredentialError('CREDENTIAL_UNAVAILABLE'));
  }, command.timeoutMs);
  const finish = (error?: WindowsCredentialError) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error) {
      for (const chunk of chunks) chunk.fill(0);
      reject(error);
      return;
    }
    const result = Buffer.concat(chunks, totalBytes);
    for (const chunk of chunks) chunk.fill(0);
    resolve(result);
  };

  child.stdout.on('data', (value: Buffer) => {
    const chunk = Buffer.from(value);
    totalBytes += chunk.byteLength;
    if (totalBytes > command.maxOutputBytes) {
      chunk.fill(0);
      child.kill();
      finish(new WindowsCredentialError('CREDENTIAL_INVALID'));
      return;
    }
    chunks.push(chunk);
  });
  child.stderr.on('data', () => undefined);
  child.once('error', () => {
    finish(new WindowsCredentialError('CREDENTIAL_UNAVAILABLE'));
  });
  child.once('close', (code) => {
    if (code !== 0) {
      finish(new WindowsCredentialError('CREDENTIAL_UNAVAILABLE'));
      return;
    }
    finish();
  });
});

export async function readWindowsGenericCredential(
  credentialTarget: string,
  options: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    runner?: CredentialCommandRunner;
    timeoutMs?: number;
  } = {},
): Promise<string> {
  const target = validateCredentialTarget(credentialTarget);
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') {
    throw new WindowsCredentialError('UNSUPPORTED_PLATFORM');
  }
  const env = options.env ?? process.env;
  const runner = options.runner ?? runCredentialCommand;
  const command: CredentialCommand = {
    executable: defaultPowerShellPath(env),
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      READ_GENERIC_CREDENTIAL_SCRIPT,
    ],
    env: safePowerShellEnvironment(env, target),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    windowsHide: true,
    maxOutputBytes: MAX_CREDENTIAL_BYTES,
  };

  let raw: Buffer | null = null;
  try {
    raw = await runner(command);
    const token = raw.toString('utf8');
    if (!TOKEN_PATTERN.test(token)) {
      throw new WindowsCredentialError('CREDENTIAL_INVALID');
    }
    return token;
  } catch (error) {
    if (error instanceof WindowsCredentialError) throw error;
    throw new WindowsCredentialError('CREDENTIAL_UNAVAILABLE');
  } finally {
    raw?.fill(0);
  }
}
