#!/usr/bin/env python3
"""Safety checks for the scheduled PostgreSQL backup.

The module deliberately never prints connection credentials or restored row
contents. It validates the Supabase project identity, checks protected source
counts, then reads COPY streams from the custom archive and counts rows in
memory before the artifact is uploaded.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit, urlunsplit


PROTECTED_TABLES = {
    "app_user": "BACKUP_MIN_USERS",
    "restaurant": "BACKUP_MIN_RESTAURANTS",
    "customer_order": "BACKUP_MIN_ORDERS",
    "menu_item": "BACKUP_MIN_MENU_ITEMS",
    "restaurant_table": "BACKUP_MIN_TABLES",
    "payment": "BACKUP_MIN_PAYMENTS",
    "menu_view": "BACKUP_MIN_MENU_VIEWS",
    "_prisma_migrations": "BACKUP_MIN_MIGRATIONS",
}
PUBLIC_TABLES_KEY = "public_tables"
PUBLIC_TABLES_ENV = "BACKUP_MIN_PUBLIC_TABLES"


@dataclass(frozen=True)
class PreparedConnection:
    url: str
    password: str
    database: str
    project_ref: str


def prepare_connection(
    raw_url: str,
    *,
    expected_project_ref: str,
    expected_database: str,
    expected_role: str | None = None,
    expected_host: str | None = None,
    expected_port: int | None = None,
) -> PreparedConnection:
    try:
        parsed = urlsplit(raw_url)
        username = unquote(parsed.username or "")
        password = unquote(parsed.password or "")
        database = unquote(parsed.path.lstrip("/"))
    except Exception as error:
        raise ValueError("DIRECT_URL is not a valid PostgreSQL URL") from error

    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError("DIRECT_URL must use the postgres or postgresql scheme")
    if not parsed.hostname or not username or not password or not database:
        raise ValueError("DIRECT_URL is missing host, username, password, or database")
    if expected_project_ref and not username.endswith(f".{expected_project_ref}"):
        raise ValueError("DIRECT_URL username does not match the expected Supabase project reference")
    if expected_role and username != f"{expected_role}.{expected_project_ref}":
        raise ValueError("DIRECT_URL does not use the dedicated backup database role")
    if expected_database and database != expected_database:
        raise ValueError("DIRECT_URL does not target the expected database")
    if expected_host and parsed.hostname.lower() != expected_host.lower():
        raise ValueError("DIRECT_URL does not target the expected database host")
    if expected_port is not None and parsed.port != expected_port:
        raise ValueError("DIRECT_URL does not use the expected session-pooler port")

    query = [
        (key, value)
        for key, value in parse_qsl(parsed.query)
        if key
        not in {
            "pgbouncer",
            "connection_limit",
            "connect_timeout",
            "pool_timeout",
            "sslmode",
        }
    ]
    query.append(("sslmode", "require"))

    host = parsed.hostname
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    netloc = f"{quote(username, safe='.') }@{host}"
    if parsed.port:
        netloc += f":{parsed.port}"

    sanitized_url = urlunsplit(
        (parsed.scheme, netloc, f"/{quote(database, safe='')}", urlencode(query), "")
    )
    return PreparedConnection(
        url=sanitized_url,
        password=password,
        database=database,
        project_ref=expected_project_ref,
    )


def _minimum_for(table: str) -> int:
    env_name = (
        PUBLIC_TABLES_ENV if table == PUBLIC_TABLES_KEY else PROTECTED_TABLES[table]
    )
    raw = os.environ.get(env_name, "1")
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{env_name} must be an integer") from error
    if value < 1:
        raise ValueError(f"{env_name} must be at least 1")
    return value


def validate_counts(counts: dict[str, int], source: str) -> None:
    for table in [*PROTECTED_TABLES, PUBLIC_TABLES_KEY]:
        actual = counts.get(table)
        minimum = _minimum_for(table)
        if actual is None:
            raise ValueError(f"{source} did not report {table}")
        if actual < minimum:
            raise ValueError(
                f"{source} {table} count {actual} is below protected floor {minimum}"
            )


def query_source_counts(connection_url: str) -> dict[str, int]:
    expressions = [
        f"(SELECT COUNT(*) FROM public.{table})::bigint"
        for table in PROTECTED_TABLES
    ]
    expressions.append(
        "(SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE')::bigint"
    )
    sql = "SET statement_timeout = '30s'; SELECT " + ", ".join(expressions) + ";"
    result = subprocess.run(
        [
            "psql",
            "-X",
            "-q",
            "-A",
            "-t",
            "-F",
            "|",
            "-v",
            "ON_ERROR_STOP=1",
            "-d",
            connection_url,
            "-c",
            sql,
        ],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )
    if result.returncode != 0:
        message = result.stderr.strip().splitlines()[-1:] or ["unknown psql error"]
        raise ValueError(f"source count query failed: {message[0]}")

    values = result.stdout.strip().split("|")
    names = [*PROTECTED_TABLES, PUBLIC_TABLES_KEY]
    if len(values) != len(names):
        raise ValueError("source count query returned an unexpected shape")
    try:
        return dict(zip(names, (int(value) for value in values), strict=True))
    except ValueError as error:
        raise ValueError("source count query returned a non-integer value") from error


def count_copy_rows(lines) -> int:
    in_copy = False
    count = 0
    for raw_line in lines:
        line = raw_line.rstrip("\r\n")
        if line.startswith("COPY public.") and line.endswith(" FROM stdin;"):
            in_copy = True
            continue
        if in_copy and line == r"\.":
            in_copy = False
            continue
        if in_copy:
            count += 1
    return count


def _archive_table_rows(archive: Path, table: str) -> int:
    result = subprocess.run(
        [
            "pg_restore",
            "--data-only",
            f"--table={table}",
            "--file=-",
            str(archive),
        ],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=300,
    )
    if result.returncode != 0:
        raise ValueError(f"pg_restore could not read protected table {table}")
    return count_copy_rows(result.stdout.splitlines())


def _archive_public_table_count(archive: Path) -> int:
    result = subprocess.run(
        ["pg_restore", "--list", str(archive)],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )
    if result.returncode != 0:
        raise ValueError("pg_restore could not read the archive table of contents")
    return sum(
        1
        for line in result.stdout.splitlines()
        if re.search(r"\bTABLE public \S+ \S+\s*$", line)
    )


def read_archive_counts(archive: Path) -> dict[str, int]:
    counts = {
        table: _archive_table_rows(archive, table) for table in PROTECTED_TABLES
    }
    counts[PUBLIC_TABLES_KEY] = _archive_public_table_count(archive)
    return counts


def compare_archive_to_source(
    archive_counts: dict[str, int], source_counts: dict[str, int]
) -> None:
    raw_percent = os.environ.get("BACKUP_MIN_SOURCE_RETENTION_PERCENT", "80")
    try:
        percentage = int(raw_percent)
    except ValueError as error:
        raise ValueError("BACKUP_MIN_SOURCE_RETENTION_PERCENT must be an integer") from error
    if not 1 <= percentage <= 100:
        raise ValueError("BACKUP_MIN_SOURCE_RETENTION_PERCENT must be between 1 and 100")

    for name, source_count in source_counts.items():
        archive_count = archive_counts.get(name, 0)
        retained_floor = math.floor(source_count * percentage / 100)
        if archive_count < retained_floor:
            raise ValueError(
                f"archive {name} count {archive_count} retains less than "
                f"{percentage}% of source count {source_count}"
            )


def write_manifest(
    path: Path,
    *,
    project_ref: str,
    database: str,
    source_counts: dict[str, int],
    archive_counts: dict[str, int],
    public_table_count: int,
    sha256: str,
) -> None:
    payload = {
        "version": 1,
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
        "database": database,
        "supabaseProjectRef": project_ref,
        "sourceCounts": source_counts,
        "archiveCounts": archive_counts,
        "publicTableCount": public_table_count,
        "sha256": sha256,
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_private(path: Path, value: str) -> None:
    path.write_text(value, encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def _command_prepare(args) -> None:
    expected_port = os.environ.get("BACKUP_EXPECTED_PORT")
    prepared = prepare_connection(
        os.environ.get("DIRECT_URL", ""),
        expected_project_ref=os.environ.get("BACKUP_EXPECTED_PROJECT_REF", ""),
        expected_database=os.environ.get("BACKUP_EXPECTED_DATABASE", ""),
        expected_role=os.environ.get("BACKUP_EXPECTED_ROLE") or None,
        expected_host=os.environ.get("BACKUP_EXPECTED_HOST") or None,
        expected_port=int(expected_port) if expected_port else None,
    )
    _write_private(Path(args.url_file), prepared.url)
    _write_private(Path(args.password_file), prepared.password)


def _command_source(args) -> None:
    counts = query_source_counts(args.connection_url)
    validate_counts(counts, "source")
    Path(args.snapshot_file).write_text(json.dumps(counts), encoding="utf-8")
    print("Source safety counts passed: " + ", ".join(f"{k}={v}" for k, v in counts.items()))


def _command_archive(args) -> None:
    archive = Path(args.archive)
    source_counts = json.loads(Path(args.snapshot_file).read_text(encoding="utf-8"))
    archive_counts = read_archive_counts(archive)
    validate_counts(archive_counts, "archive")
    compare_archive_to_source(archive_counts, source_counts)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    write_manifest(
        Path(args.manifest_file),
        project_ref=os.environ["BACKUP_EXPECTED_PROJECT_REF"],
        database=os.environ["BACKUP_EXPECTED_DATABASE"],
        source_counts=source_counts,
        archive_counts=archive_counts,
        public_table_count=archive_counts[PUBLIC_TABLES_KEY],
        sha256=digest,
    )
    print("Archive safety counts passed: " + ", ".join(f"{k}={v}" for k, v in archive_counts.items()))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare = subparsers.add_parser("prepare-connection")
    prepare.add_argument("--url-file", required=True)
    prepare.add_argument("--password-file", required=True)
    prepare.set_defaults(handler=_command_prepare)

    source = subparsers.add_parser("verify-source")
    source.add_argument("--connection-url", required=True)
    source.add_argument("--snapshot-file", required=True)
    source.set_defaults(handler=_command_source)

    archive = subparsers.add_parser("verify-archive")
    archive.add_argument("--archive", required=True)
    archive.add_argument("--snapshot-file", required=True)
    archive.add_argument("--manifest-file", required=True)
    archive.set_defaults(handler=_command_archive)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        args.handler(args)
        return 0
    except (KeyError, OSError, subprocess.SubprocessError, ValueError) as error:
        print(f"FAILED: backup safety check: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
