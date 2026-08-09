import json
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parent
detect_file = root / '.graphify_detect.json'
d = json.loads(detect_file.read_text(encoding='utf-16'))
all_files = []
for files in d['files'].values():
    all_files.extend(files)

counts = Counter()
for f in all_files:
    parent = str(Path(f).parent.relative_to(root))
    counts[parent] += 1

for path, n in counts.most_common(10):
    print(f"  {n:3d}  {path}")
