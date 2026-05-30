import json
from pathlib import Path
d = json.loads(Path('F:/PROGRAMING/QR_Digital_Menu-main/.graphify_detect.json').read_text(encoding='utf-16'))
vids = d['files'].get('video', [])
for v in vids:
    print(v)
