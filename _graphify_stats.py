import json
from pathlib import Path

root = Path(__file__).resolve().parent
detect_file = root / '.graphify_detect.json'
d = json.loads(detect_file.read_text(encoding='utf-16'))
print(f"total_files: {d['total_files']}")
print(f"total_words: {d['total_words']}")
for cat, files in d['files'].items():
    print(f"  {cat}: {len(files)} files")
if d.get('skipped_sensitive'):
    print(f"skipped_sensitive: {len(d['skipped_sensitive'])}")
