#!/usr/bin/env bash
set -euo pipefail
umask 077
# Credentials belong in /etc/nb24/mysql-backup.cnf (root-readable, mode 600).
# [client] user=... password=... host=127.0.0.1
backup_dir=/var/backups/nb24
mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mysqldump --defaults-extra-file=/etc/nb24/mysql-backup.cnf --single-transaction --routines --triggers namaste_bharat | gzip > "$backup_dir/database-$stamp.sql.gz"
tar -czf "$backup_dir/uploads-$stamp.tar.gz" -C /srv/namaste-bharat/backend uploads
# Copy encrypted backups off-host before configuring a retention/deletion policy.
echo "Backup completed: $stamp"
