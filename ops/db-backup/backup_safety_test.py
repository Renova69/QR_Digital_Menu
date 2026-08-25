import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backup_safety


class BackupSafetyTest(unittest.TestCase):
    def test_rejects_the_wrong_supabase_project(self):
        with self.assertRaisesRegex(ValueError, "project reference"):
            backup_safety.prepare_connection(
                "postgresql://postgres.wrong:test-secret@pooler.example.com:5432/postgres",
                expected_project_ref="expected",
                expected_database="postgres",
            )

    def test_removes_the_password_and_transaction_pooler_flags(self):
        connection = backup_safety.prepare_connection(
            "postgresql://qr_menu_backup.expected:test-secret@pooler.example.com:5432/postgres"
            "?pgbouncer=true&connection_limit=1&sslmode=disable",
            expected_project_ref="expected",
            expected_database="postgres",
            expected_role="qr_menu_backup",
        )

        self.assertNotIn("test-secret", connection.url)
        self.assertEqual(connection.password, "test-secret")
        self.assertIn("sslmode=require", connection.url)
        self.assertNotIn("pgbouncer", connection.url)
        self.assertNotIn("connection_limit", connection.url)

    def test_rejects_an_owner_credential_for_the_backup_job(self):
        with self.assertRaisesRegex(ValueError, "dedicated backup database role"):
            backup_safety.prepare_connection(
                "postgresql://postgres.expected:test-secret@pooler.example.com:5432/postgres",
                expected_project_ref="expected",
                expected_database="postgres",
                expected_role="qr_menu_backup",
            )

    def test_rejects_a_source_snapshot_below_the_protected_floor(self):
        counts = {name: 100 for name in backup_safety.PROTECTED_TABLES}
        counts["customer_order"] = 0

        with patch.dict(
            os.environ,
            {"BACKUP_MIN_ORDERS": "1"},
            clear=False,
        ):
            with self.assertRaisesRegex(ValueError, "customer_order"):
                backup_safety.validate_counts(counts, "source")

    def test_counts_only_copy_rows_without_printing_their_contents(self):
        dump = """-- header
COPY public.app_user (id, email) FROM stdin;
1\tfirst@example.test
2\tsecond@example.test
\\.
-- footer
"""

        stdout = io.StringIO()
        with redirect_stdout(stdout):
            count = backup_safety.count_copy_rows(dump.splitlines())

        self.assertEqual(count, 2)
        self.assertEqual(stdout.getvalue(), "")

    def test_archive_must_retain_most_of_the_source_snapshot(self):
        source = {name: 100 for name in backup_safety.PROTECTED_TABLES}
        archive = dict(source)
        archive["menu_item"] = 79

        with self.assertRaisesRegex(ValueError, "menu_item"):
            backup_safety.compare_archive_to_source(archive, source)

    def test_writes_a_manifest_without_credentials_or_row_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "manifest.json"
            counts = {name: 100 for name in backup_safety.PROTECTED_TABLES}
            backup_safety.write_manifest(
                target,
                project_ref="expected",
                database="postgres",
                source_counts=counts,
                archive_counts=counts,
                public_table_count=54,
                sha256="a" * 64,
            )

            manifest = target.read_text(encoding="utf-8")
            self.assertIn('"customer_order": 100', manifest)
            self.assertNotIn("password", manifest.lower())
            self.assertNotIn("postgresql://", manifest)


if __name__ == "__main__":
    unittest.main()
