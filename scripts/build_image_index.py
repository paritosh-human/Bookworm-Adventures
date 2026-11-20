"""Writes pam/images_index.json (lowercase name -> real filename stem) and pam/pam_index.json
(lowercase .pam stem -> real stem) per game so the loader can resolve .pam file and image names
case-insensitively (case-sensitive static hosts, mixed-case originals)."""
import json, os, sys
root = os.path.join(os.path.dirname(__file__), '..', 'public')
for g in ('adventures', 'adventures-vol2'):
    base = os.path.join(root, g, 'pam')
    d = os.path.join(base, 'images_rgba')
    if os.path.isdir(d):
        idx = {f[:-4].lower(): f[:-4] for f in os.listdir(d) if f.endswith('.png')}
        json.dump(idx, open(os.path.join(base, 'images_index.json'), 'w'), separators=(',', ':'))
        print(g, 'images', len(idx))
    if os.path.isdir(base):
        pidx = {f[:-4].lower(): f[:-4] for f in os.listdir(base) if f.endswith('.pam')}
        json.dump(pidx, open(os.path.join(base, 'pam_index.json'), 'w'), separators=(',', ':'))
        print(g, 'pams', len(pidx))
