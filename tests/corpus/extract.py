"""Extract independently delimited sources; never execute code from the checkouts."""
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(sys.argv[1]).resolve()
repositories = json.loads(Path(__file__).with_name("repositories.json").read_text())
cases = []
for repository in repositories:
	name = repository["repository"].split("/")[1]
	directory = root / name
	revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=directory, text=True).strip()
	if revision != repository["revision"]:
		raise RuntimeError("Unexpected revision for " + name + ": " + revision)
	subprocess.run(["git", "diff", "--no-ext-diff", "--quiet", "HEAD"], cwd=directory, check=True)
	before = len(cases)
	for path in sorted(directory.rglob("*")):
		if ".git" in path.parts or path.is_symlink() or not path.is_file():
			continue
		identity = dict(repository=repository["repository"], path=str(path.relative_to(directory)), format=repository["format"])
		if repository["format"] == "oscat":
			if path.suffix.upper() != ".EXP":
				continue
			# Legacy exports are not UTF-8. Latin-1 preserves every byte one-to-one;
			# this audit concerns the ASCII grammar, not importing an EXP file's encoding.
			source = path.read_bytes().decode("latin1")
			marker = re.search(r"\(\* @END_DECLARATION := .*?\*\)", source)
			if marker is None:
				raise RuntimeError("Missing export boundary: " + str(path))
			cases.append(dict(identity, name=path.stem, source=source, boundary=marker.start()))
			continue
		if path.suffix.lower() not in (".tcpou", ".tcdut", ".tcgvl", ".tcio"):
			continue
		for obj in ET.parse(path).iter():
			declaration = obj.find("Declaration")
			if declaration is None or not declaration.text:
				continue
			# Accessors/actions have no POU header. They are covered by the discovery
			# tests rather than being misrepresented as complete standalone ST objects.
			if obj.tag in ("Get", "Set", "Action"):
				continue
			body = obj.find("Implementation/ST")
			if obj.find("Implementation") is not None and body is None:
				continue  # Graphical implementations are outside the splitter's contract.
			cases.append(dict(identity, name=obj.get("Name"), declaration=declaration.text,
				implementation=(body.text or "") if body is not None else None))
	if len(cases) - before != repository["objects"]:
		raise RuntimeError("Unexpected extracted object count for " + name)
print(json.dumps(cases))
