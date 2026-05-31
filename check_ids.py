import re

with open('/sessions/trusting-awesome-knuth/mnt/password-generator/index.html', 'r') as f:
    html = f.read()

with open('/sessions/trusting-awesome-knuth/mnt/password-generator/app.js', 'r') as f:
    js = f.read()

html_ids = set(re.findall(r'id=["\'](\w+)["\']', html))

js_ids = set()
for m in re.finditer(r"getElementById\(['\"](\w+)['\"]\)", js):
    js_ids.add(m.group(1))
for m in re.finditer(r"\$\(['\"]#(\w+)['\"]\)", js):
    js_ids.add(m.group(1))

print("HTML IDs:", sorted(html_ids))
print()
print("JS IDs referenced:", sorted(js_ids))
print()

unused = html_ids - js_ids
missing = js_ids - html_ids

if unused:
    print("HTML IDs NOT referenced in JS:", sorted(unused))
if missing:
    print("JS refs MISSING from HTML:", sorted(missing))
if not unused and not missing:
    print("All IDs match!")
