# Database Backup & Restore Guide

**ClawOps Console** — Database Backup & Recovery Procedures

---

## Overview

ClawOps Console uses SQLite for data storage. This guide covers:
- Automated daily backups
- Manual backup procedures
- Restore procedures
- Disaster recovery

---

## Automated Backups

### Quick Setup

**Linux/WSL**:
```bash
# Test the backup script
./scripts/backup-database.sh

# Schedule daily backups at 2 AM (cron)
crontab -e
# Add this line:
0 2 * * * cd /path/to/clawops && ./scripts/backup-database.sh >> ./logs/backup.log 2>&1
```

**Windows**:
```batch
REM Test the backup script
scripts\backup-database.bat

REM Schedule using Task Scheduler (see below)
```

### Features

- ✅ **Timestamped Backups**: `clawops-backup-YYYYMMDD-HHMMSS.db`
- ✅ **Integrity Verification**: Every backup is verified after creation
- ✅ **Automatic Rotation**: Keeps last 7 days by default
- ✅ **Safe Concurrent Access**: Uses SQLite `.backup` command (not file copy)

### Backup Location

Default: `./backups/`

Override with environment variable:
```bash
export BACKUP_DIR=/mnt/nas/clawops-backups
./scripts/backup-database.sh
```

### Retention Policy

Default: **7 days**

Override with environment variable:
```bash
export RETENTION_DAYS=30
./scripts/backup-database.sh
```

---

## Scheduling Backups

### Option 1: Cron (Linux/WSL)

```bash
# Edit crontab
crontab -e

# Daily at 2 AM
0 2 * * * cd /home/user/clawops && ./scripts/backup-database.sh >> ./logs/backup.log 2>&1

# Every 6 hours
0 */6 * * * cd /home/user/clawops && ./scripts/backup-database.sh >> ./logs/backup.log 2>&1

# Twice daily (2 AM and 2 PM)
0 2,14 * * * cd /home/user/clawops && ./scripts/backup-database.sh >> ./logs/backup.log 2>&1
```

**Tips**:
- Use absolute paths in cron jobs
- Redirect output to log file for debugging
- Test manually first: `./scripts/backup-database.sh`

### Option 2: Windows Task Scheduler

1. **Open Task Scheduler**:
   - Press `Win + R`, type `taskschd.msc`, press Enter

2. **Create Basic Task**:
   - Click "Create Basic Task" in right sidebar
   - Name: `ClawOps Database Backup`
   - Description: `Daily backup of ClawOps Console database`

3. **Configure Trigger**:
   - When: `Daily`
   - Start date: Today
   - Recur every: `1` days
   - Time: `02:00:00` (2 AM)

4. **Configure Action**:
   - Action: `Start a program`
   - Program/script: `C:\Users\SPilcher\OpenClaw2.0 for linux\scripts\backup-database.bat`
   - Start in: `C:\Users\SPilcher\OpenClaw2.0 for linux`

5. **Finish**:
   - Check "Open the Properties dialog"
   - Under "General" tab:
     - ✅ Run whether user is logged on or not
     - ✅ Run with highest privileges
   - Under "Settings" tab:
     - ✅ If the task fails, restart every: `1 hour`
     - ✅ Attempt to restart up to: `3` times

6. **Test the Task**:
   - Right-click the task → "Run"
   - Check `C:\Users\SPilcher\OpenClaw2.0 for linux\backups\` for new backup

### Option 3: systemd Timer (Linux)

For systemd-based Linux systems:

**Create service file** (`/etc/systemd/system/clawops-backup.service`):
```ini
[Unit]
Description=ClawOps Console Database Backup
After=network.target

[Service]
Type=oneshot
User=your-username
WorkingDirectory=/home/your-username/clawops
ExecStart=/home/your-username/clawops/scripts/backup-database.sh
StandardOutput=append:/home/your-username/clawops/logs/backup.log
StandardError=append:/home/your-username/clawops/logs/backup.log
```

**Create timer file** (`/etc/systemd/system/clawops-backup.timer`):
```ini
[Unit]
Description=ClawOps Console Database Backup Timer
Requires=clawops-backup.service

[Timer]
OnCalendar=daily
OnCalendar=02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

**Enable and start**:
```bash
sudo systemctl daemon-reload
sudo systemctl enable clawops-backup.timer
sudo systemctl start clawops-backup.timer
sudo systemctl status clawops-backup.timer
```

---

## Manual Backup

### Command Line

```bash
# Linux/WSL
./scripts/backup-database.sh

# Windows
scripts\backup-database.bat
```

### Using SQLite CLI

```bash
# Connect to database
sqlite3 data/clawops.db

# Create backup
.backup 'backups/manual-backup-2024-02-12.db'

# Exit
.quit
```

### Simple File Copy (NOT RECOMMENDED)

⚠️ **WARNING**: Only use this method if the server is stopped!

```bash
# Stop the server first!
pkill -f "node server/index.js"

# Copy database
cp data/clawops.db backups/manual-backup.db

# Restart server
npm run server
```

**Why Not Recommended?**: File copy doesn't guarantee consistency if database is in use. Use SQLite `.backup` command instead.

---

## Restore Procedures

### Automated Restore (RECOMMENDED)

The restore script includes safety features:
- ✅ Creates safety backup of current database before restore
- ✅ Verifies backup integrity before restore
- ✅ Verifies restored database after restore
- ✅ Automatic rollback if restore fails

```bash
# List available backups
ls -lh backups/

# Restore a specific backup
./scripts/restore-database.sh backups/clawops-backup-20260212-140530.db

# Follow prompts and confirm restore
```

**Example output**:
```
[2026-02-12 14:30:00] Verifying backup integrity...
[2026-02-12 14:30:00] ✅ Backup integrity verified
[2026-02-12 14:30:00] Backup information:
[2026-02-12 14:30:00]   File: backups/clawops-backup-20260212-140530.db
[2026-02-12 14:30:00]   Size: 2.3M
[2026-02-12 14:30:00]   Created: 2026-02-12 02:00:00
[2026-02-12 14:30:00]   Tables: 12
[2026-02-12 14:30:00] Creating safety backup of current database...
[2026-02-12 14:30:00] Safety backup: ./data/clawops-pre-restore-20260212-143000.db
[2026-02-12 14:30:00] ✅ Safety backup created (2.5M)
⚠️  This will REPLACE the current database with the backup.
⚠️  Current database: ./data/clawops.db
⚠️  Safety backup saved at: ./data/clawops-pre-restore-20260212-143000.db
Are you sure you want to proceed? (yes/no): yes
[2026-02-12 14:30:05] Restoring database...
[2026-02-12 14:30:05] ✅ Database restored successfully
[2026-02-12 14:30:05] ✅ Restored database integrity verified
[2026-02-12 14:30:05] ✅ Restore process complete!
```

### Manual Restore

```bash
# 1. Stop the server
pkill -f "node server/index.js"

# 2. Create safety backup
cp data/clawops.db data/clawops-safety-backup.db

# 3. Restore from backup
cp backups/clawops-backup-20260212-140530.db data/clawops.db

# 4. Verify integrity
sqlite3 data/clawops.db "PRAGMA integrity_check;"
# Should output: ok

# 5. Restart server
npm run server
```

---

## Disaster Recovery

### Scenario 1: Database Corruption

**Symptoms**:
- Server won't start
- `PRAGMA integrity_check` fails
- SQLite errors in logs

**Recovery**:
1. Stop the server
2. Restore from most recent backup:
   ```bash
   ./scripts/restore-database.sh backups/clawops-backup-YYYYMMDD-HHMMSS.db
   ```
3. Start the server
4. Verify functionality

### Scenario 2: Accidental Data Deletion

**Recovery**:
1. Identify when data was still present (check backup timestamps)
2. Restore from backup before deletion:
   ```bash
   ./scripts/restore-database.sh backups/clawops-backup-YYYYMMDD-HHMMSS.db
   ```
3. Export the deleted data:
   ```bash
   sqlite3 data/clawops.db ".dump agents" > agents-recovery.sql
   ```
4. Restore current database
5. Import recovered data

### Scenario 3: Complete Data Loss

**Prerequisites**:
- Backups stored on separate drive/NAS
- Backups replicated off-site (cloud storage)

**Recovery**:
1. Reinstall ClawOps Console
2. Copy backups to `./backups/`
3. Restore most recent backup:
   ```bash
   ./scripts/restore-database.sh backups/clawops-backup-YYYYMMDD-HHMMSS.db
   ```
4. Verify all data restored correctly

---

## Backup Best Practices

### 3-2-1 Backup Rule

**3** copies of your data:
- Original database (`data/clawops.db`)
- Local backup (`backups/`)
- Off-site backup (cloud/NAS)

**2** different storage media:
- Local disk (SSD/HDD)
- Network storage (NAS) or cloud (Dropbox, Google Drive, AWS S3)

**1** copy off-site:
- Protects against fire, theft, hardware failure

### Implementation

**Sync backups to NAS** (Linux):
```bash
# Add to backup script or separate cron job
rsync -av --delete ./backups/ /mnt/nas/clawops-backups/
```

**Sync to cloud** (rclone):
```bash
# Configure rclone first: rclone config
rclone sync ./backups/ dropbox:clawops-backups --verbose
```

**Sync to cloud** (Windows):
- Use Dropbox/OneDrive folder sync
- Move `./backups/` to synced folder
- Update `BACKUP_DIR` environment variable

---

## Testing Backups

⚠️ **CRITICAL**: Untested backups are useless backups!

### Monthly Backup Test

**Schedule**: First Sunday of each month

**Procedure**:
1. Choose a recent backup:
   ```bash
   ls -lh backups/ | head -5
   ```

2. Create test directory:
   ```bash
   mkdir -p test-restore
   cd test-restore
   ```

3. Restore to test location:
   ```bash
   cp ../backups/clawops-backup-YYYYMMDD-HHMMSS.db ./test.db
   ```

4. Verify integrity:
   ```bash
   sqlite3 test.db "PRAGMA integrity_check;"
   # Should output: ok
   ```

5. Verify data:
   ```bash
   sqlite3 test.db "SELECT COUNT(*) FROM agents;"
   sqlite3 test.db "SELECT COUNT(*) FROM runs;"
   sqlite3 test.db "SELECT COUNT(*) FROM messages;"
   ```

6. Document results:
   ```bash
   echo "$(date): Backup test PASSED" >> ../logs/backup-tests.log
   ```

7. Clean up:
   ```bash
   cd ..
   rm -rf test-restore
   ```

---

## Monitoring Backups

### Check Last Backup

```bash
# Linux/WSL
ls -lht backups/ | head -1

# Windows
dir /O-D backups\clawops-backup-*.db | findstr /n "^" | findstr "^1:"
```

### Verify Backup Schedule

```bash
# Linux cron
crontab -l | grep backup

# Linux systemd
systemctl list-timers | grep clawops

# Windows Task Scheduler
schtasks /query /TN "ClawOps Database Backup"
```

### Check Backup Logs

```bash
# View recent backup logs
tail -50 logs/backup.log

# Check for errors
grep ERROR logs/backup.log

# Check backup sizes
du -sh backups/clawops-backup-*.db | tail -7
```

---

## Backup Script Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `./data/clawops.db` | Database file to backup |
| `BACKUP_DIR` | `./backups` | Where to store backups |
| `RETENTION_DAYS` | `7` | How many days of backups to keep |

### Examples

```bash
# Backup to NAS
export BACKUP_DIR=/mnt/nas/clawops-backups
./scripts/backup-database.sh

# Keep 30 days of backups
export RETENTION_DAYS=30
./scripts/backup-database.sh

# Custom database path
export DB_PATH=/opt/clawops/database.db
./scripts/backup-database.sh
```

---

## Troubleshooting

### "sqlite3: command not found"

**Windows**:
1. Download SQLite tools: https://www.sqlite.org/download.html
2. Extract `sqlite3.exe` to project folder or add to PATH

**Linux/WSL**:
```bash
sudo apt-get install sqlite3  # Ubuntu/Debian
sudo yum install sqlite       # CentOS/RHEL
```

### "Backup integrity check failed"

Possible causes:
- Disk full during backup
- Hardware failure
- Backup interrupted

**Solution**:
1. Check disk space: `df -h`
2. Re-run backup immediately
3. If problem persists, check disk health

### "Permission denied"

**Linux/WSL**:
```bash
# Make scripts executable
chmod +x scripts/*.sh

# Fix file permissions
chmod 644 data/clawops.db
chmod 755 backups/
```

**Windows**:
- Run as Administrator
- Check folder permissions in Properties

### Backups Growing Too Large

**Vacuum the database** (reclaim space):
```bash
sqlite3 data/clawops.db "VACUUM;"
```

**Purge old data**:
- Delete old runs: `DELETE FROM runs WHERE created_at < date('now', '-30 days');`
- Delete old messages: `DELETE FROM messages WHERE created_at < date('now', '-30 days');`

---

## Appendix: Backup File Format

### Filename Convention

```
clawops-backup-YYYYMMDD-HHMMSS.db
```

**Example**: `clawops-backup-20260212-140530.db`
- Date: 2026-02-12
- Time: 14:05:30 (2:05:30 PM)

### File Contents

Standard SQLite 3 database file. Can be opened with:
- SQLite CLI: `sqlite3 backup-file.db`
- DB Browser for SQLite (GUI)
- Any SQLite client

### Compression (Optional)

To save space, compress old backups:

```bash
# Compress backups older than 7 days
find backups/ -name "*.db" -mtime +7 -exec gzip {} \;

# Decompress for restore
gunzip backups/clawops-backup-YYYYMMDD-HHMMSS.db.gz
```

---

## Quick Reference

```bash
# Create backup
./scripts/backup-database.sh

# List backups
ls -lht backups/

# Restore backup (with safety checks)
./scripts/restore-database.sh backups/clawops-backup-YYYYMMDD-HHMMSS.db

# Verify database integrity
sqlite3 data/clawops.db "PRAGMA integrity_check;"

# Check backup schedule
crontab -l | grep backup

# View backup logs
tail -f logs/backup.log

# Test backup
sqlite3 backups/latest.db "PRAGMA integrity_check; SELECT COUNT(*) FROM agents;"
```

---

**Remember**: Backups are only useful if they're:
1. **Regular** (automated daily)
2. **Verified** (integrity checked)
3. **Tested** (monthly restore test)
4. **Off-site** (cloud/NAS copy)
5. **Monitored** (check logs regularly)
