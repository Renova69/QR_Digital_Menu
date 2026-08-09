import json
from pathlib import Path

root = Path(__file__).resolve().parent
detect_file = root / '.graphify_detect.json'
d = json.loads(detect_file.read_text(encoding='utf-16'))
vids = d['files'].get('video', [])
for v in vids:
    print(v)
