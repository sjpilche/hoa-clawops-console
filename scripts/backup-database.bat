@echo off
REM Database Backup Script for ClawOps Console (Windows)
REM
REM This script creates timestamped backups of the SQLite database
REM and automatically rotates old backups (keeps last 7 days).
REM
REM USAGE:
REM   backup-database.bat
REM
REM SCHEDULING (Windows Task Scheduler):
REM   1. Open Task Scheduler
REM   2. Create Basic Task
REM   3. Name: "ClawOps Database Backup"
REM   4. Trigger: Daily at 2:00 AM
REM   5. Action: Start a program
REM      Program: C:\Users\SPilcher\OpenClaw2.0 for linux\scripts\backup-database.bat
REM      Start in: C:\Users\SPilcher\OpenClaw2.0 for linux
REM

setlocal enabledelayedexpansion

REM Configuration
set "PROJECT_ROOT=%~dp0.."
if not defined DB_PATH set "DB_PATH=%PROJECT_ROOT%\data\clawops.db"
if not defined BACKUP_DIR set "BACKUP_DIR=%PROJECT_ROOT%\backups"
if not defined RETENTION_DAYS set "RETENTION_DAYS=7"

REM Check if database exists
if not exist "%DB_PATH%" (
  echo [ERROR] Database not found at: %DB_PATH%
  echo Set DB_PATH environment variable or check your configuration
  exit /b 1
)

REM Create backup directory if it doesn't exist
if not exist "%BACKUP_DIR%" (
  mkdir "%BACKUP_DIR%"
  echo [INFO] Created backup directory: %BACKUP_DIR%
)

REM Generate timestamp for backup filename (YYYYmmdd-HHMMSS)
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TIMESTAMP=%datetime:~0,8%-%datetime:~8,6%
set "BACKUP_FILE=%BACKUP_DIR%\clawops-backup-%TIMESTAMP%.db"

echo [INFO] Starting database backup...
echo [INFO] Source: %DB_PATH%
echo [INFO] Destination: %BACKUP_FILE%

REM Check if sqlite3 is available
where sqlite3 >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [WARNING] sqlite3 command not found in PATH
  echo [INFO] Using file copy as fallback...
  copy "%DB_PATH%" "%BACKUP_FILE%" >nul
  if %ERRORLEVEL% equ 0 (
    echo [INFO] Backup completed successfully using file copy
  ) else (
    echo [ERROR] Backup failed!
    exit /b 1
  )
) else (
  REM Perform backup using SQLite's backup API (safer than copy)
  sqlite3 "%DB_PATH%" ".backup '%BACKUP_FILE%'"
  if %ERRORLEVEL% equ 0 (
    echo [INFO] Backup completed successfully

    REM Verify backup integrity
    echo [INFO] Verifying backup integrity...
    sqlite3 "%BACKUP_FILE%" "PRAGMA integrity_check;" >nul 2>nul
    if %ERRORLEVEL% equ 0 (
      echo [INFO] Backup integrity verified
    ) else (
      echo [ERROR] Backup integrity check failed!
      echo [ERROR] Backup may be corrupt: %BACKUP_FILE%
      exit /b 1
    )
  ) else (
    echo [ERROR] Backup failed!
    exit /b 1
  )
)

REM Rotate old backups (delete backups older than RETENTION_DAYS)
echo [INFO] Rotating old backups (keeping last %RETENTION_DAYS% days)...

set DELETED_COUNT=0
for /f "delims=" %%F in ('dir /b /a-d "%BACKUP_DIR%\clawops-backup-*.db" 2^>nul') do (
  set "BACKUP_PATH=%BACKUP_DIR%\%%F"

  REM Check if file is older than retention days
  forfiles /P "%BACKUP_DIR%" /M "%%F" /D -%RETENTION_DAYS% >nul 2>nul
  if !ERRORLEVEL! equ 0 (
    echo [INFO] Deleting old backup: %%F
    del "!BACKUP_PATH!" >nul 2>nul
    set /a DELETED_COUNT+=1
  )
)

if %DELETED_COUNT% gtr 0 (
  echo [INFO] Deleted %DELETED_COUNT% old backup(s)
) else (
  echo [INFO] No old backups to delete
)

REM Show current backup status
set BACKUP_COUNT=0
for /f "delims=" %%F in ('dir /b /a-d "%BACKUP_DIR%\clawops-backup-*.db" 2^>nul') do (
  set /a BACKUP_COUNT+=1
)

echo [INFO] Backup status:
echo [INFO]   Total backups: %BACKUP_COUNT%
echo [INFO]   Retention: %RETENTION_DAYS% days

REM List recent backups
echo [INFO] Recent backups:
dir /b /o-d /a-d "%BACKUP_DIR%\clawops-backup-*.db" 2>nul | findstr /n "^" | findstr /r "^[1-5]:" | for /f "tokens=1* delims=:" %%A in ('more') do (
  set "BACKUP_NAME=%%B"
  for %%S in ("%BACKUP_DIR%\!BACKUP_NAME!") do (
    set "SIZE=%%~zS"
    set /a "SIZE_MB=!SIZE! / 1048576"
    echo [INFO]   - !BACKUP_NAME! (!SIZE_MB! MB)
  )
)

echo [INFO] Backup process complete!
exit /b 0
