"""One long-lived script inside CODESYS; all engine calls stay on its script thread."""
from __future__ import print_function

import io
import json
import os
import traceback

if __name__ == "__main__":
	import sys

	sys.path.insert(0, os.environ["CODESYS_BUILD_SESSION"])
from build import build


def write_json(path, value):
	# The client reads only complete replies. Each request has a unique filename.
	with io.open(path + ".tmp", "w", encoding="utf-8") as output:
		output.write(u"{0}".format(json.dumps(value, ensure_ascii=False)))
	os.rename(path + ".tmp", path)


def run_build(engine, directory, name, loaded):
	if not name.startswith("run-") or os.path.basename(name) != name:
		raise ValueError("Invalid build directory")
	root = os.path.join(os.path.dirname(os.path.dirname(directory)), name)
	with io.open(os.path.join(root, "request.json"), "r", encoding="utf-8") as source:
		request = json.load(source)
	for key in ("template", "project", "output", "receipt"):
		request[key] = os.path.join(root, request[key])
	try:
		build(engine, request, loaded, directory)
	except Exception:
		with io.open(os.path.join(root, "error.txt"), "w", encoding="utf-8") as output:
			output.write(u"{0}".format(traceback.format_exc()))
		raise


def serve(engine, directory):
	request_path = os.path.join(directory, "request.json")
	loaded = {}
	while True:
		if not os.path.isfile(request_path):
			# Unlike time.sleep, this keeps CODESYS's message loop responsive.
			engine.system.delay(200)
			continue
		with io.open(request_path, "r", encoding="utf-8") as source:
			command = json.load(source)
		os.remove(request_path)
		response = {"id": command["id"], "ok": True}
		try:
			if command["action"] == "build":
				run_build(engine, directory, command["directory"], loaded)
			elif command["action"] not in ("ping", "stop"):
				raise ValueError("Unknown worker action")
		except Exception:
			response = {"id": command["id"], "ok": False, "error": traceback.format_exc()}
		write_json(os.path.join(directory, command["id"] + ".json"), response)
		if command["action"] == "stop":
			return


if __name__ == "__main__":
	import scriptengine
	scriptengine.system.script_prompt_handling = scriptengine.ScriptPromptHandling.LogPrompts
	exit_code = 0
	try:
		serve(scriptengine, os.environ["CODESYS_BUILD_SESSION"])
	except Exception:
		traceback.print_exc()
		exit_code = 1
	if os.environ.get("CODESYS_BUILD_NATIVE_EXIT") == "true":
		import ctypes
		ctypes.windll.kernel32.ExitProcess(exit_code)
	scriptengine.system.exit(exit_code)
