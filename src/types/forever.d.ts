/**
 * Type definitions for forever module
 * Since forever doesn't have official TypeScript types
 */

declare module 'forever' {
  const forever: {
    start(script: string, options?: ForeverOptions): ForeverChild;
    stop(uid: string): void;
    stopbypid(pid: number): void;
    stopAll(): void;
    restart(uid: string): void;
    list(format: boolean, callback: (err: Error | null, processes?: ForeverProcess[]) => void): void;
    cleanUp(): void;
    config: any;
  };
  
  export default forever;
  export interface ForeverOptions {
    uid?: string;
    append?: boolean;
    watch?: boolean;
    max?: number;
    silent?: boolean;
    killTree?: boolean;
    minUptime?: number;
    spinSleepTime?: number;
    logFile?: string;
    outFile?: string;
    errFile?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    hideEnv?: string[];
  }

  export interface ForeverProcess {
    uid: string;
    pid?: number;
    foreverPid?: number;
    ctime?: string;
    command?: string;
    file?: string;
    args?: string[];
    env?: Record<string, string>;
    running?: boolean;
    logFile?: string;
    outFile?: string;
    errFile?: string;
  }

  export interface ForeverChild extends NodeJS.EventEmitter {
    child: any;
    start(): void;
    stop(): void;
    restart(): void;
  }

}