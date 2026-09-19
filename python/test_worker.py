import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from worker import serve


class WorkerTests(unittest.TestCase):
	def run_worker(self, actions, compile):
		with tempfile.TemporaryDirectory() as temporary:
			root = Path(temporary)
			session = root / "build" / ".codesys" / "worker"
			session.mkdir(parents=True)
			commands = []
			for index, action in enumerate(actions + ["stop"]):
				command = {"id": str(index), "action": action}
				if action == "build":
					output = session.parent / "build"
					output.mkdir(exist_ok=True)
					(output / "request.json").write_text(json.dumps({
						"mode": "build", "objects": [], "project": "FrameAssembly.project",
						
						"output": "runtime/Application.app", "receipt": "compiled.json",
						"template": "Template.project", "templateHash": "template-fixture",
					}))
				commands.append(command)
			pending = iter(commands)
			def wait(milliseconds):
				(session / "request.json").write_text(json.dumps(next(pending)))
			engine = SimpleNamespace(system=SimpleNamespace(delay=wait))
			with patch("worker.build", side_effect=compile):
				serve(engine, str(session))
			responses = [json.loads((session / (command["id"] + ".json")).read_text()) for command in commands]
			errors = [path.read_text() for path in (session.parent / "build").glob("error.txt")]
			return responses, errors

	def test_handles_multiple_builds_and_health_checks_without_exiting(self):
		requests = []
		def compile(engine, request, loaded, workspace):
			requests.append(request)
		responses, errors = self.run_worker(["ping", "build", "ping", "build"], compile)
		self.assertTrue(all(response["ok"] for response in responses))
		self.assertEqual(errors, [])
		self.assertEqual(len(requests), 2)
		self.assertEqual(requests[0]["project"], requests[1]["project"])
		for request in requests:
			project = Path(request["project"])
			self.assertTrue(project.is_absolute())
			self.assertEqual(Path(request["template"]).parent, project.parent)
			self.assertEqual(Path(request["output"]).parent.parent, project.parent)

	def test_reports_a_failed_build_and_processes_the_next_request(self):
		failure = "Fixture compiler failure after writing a receipt"
		requests = []
		def compile(engine, request, loaded, workspace):
			requests.append(request)
			if len(requests) == 1:
				Path(request["receipt"]).write_text(json.dumps({"mode": "build"}))
				raise RuntimeError(failure)
		responses, errors = self.run_worker(["build", "build"], compile)
		self.assertFalse(responses[0]["ok"])
		self.assertIn(failure, responses[0]["error"])
		self.assertTrue(responses[1]["ok"])
		self.assertTrue(responses[2]["ok"])
		self.assertEqual(len(errors), 1)
		self.assertIn(failure, errors[0])


if __name__ == "__main__":
	unittest.main()
