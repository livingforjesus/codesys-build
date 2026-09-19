import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from build import build


class Calls(list):
	def __init__(self, task):
		self.task = task
		super().__init__(child.name for child in task.children)
	def add(self, name):
		self.task.create(name, "task_call")


class Node:
	def __init__(self, name, kind, parent=None):
		self.name, self.kind, self.parent = name, kind, parent
		self.children = []
		self.declaration, self.implementation = "", ""
		self.textual_declaration = SimpleNamespace(replace=lambda text: setattr(self, "declaration", text))
		self.textual_implementation = SimpleNamespace(replace=lambda text: setattr(self, "implementation", text))
		self.is_folder = kind == "folder"
		self.is_task = kind == "task"
		self.is_symbol_config = kind == "symbols"
		if self.is_task:
			self.create("PLC_PRG", "task_call")
	@property
	def pous(self):
		# Match the engine: list.remove changes the snapshot, not the task tree.
		return Calls(self)
	@property
	def calls(self):
		return [child.name for child in self.children]

	def get_name(self):
		return self.name
	def get_children(self):
		return self.children
	def remove(self):
		self.parent.children.remove(self)
	def find_ignore_transient_objects(self, name, recursive):
		matches = [child for child in self.children if child.kind != "task_call" and child.name.lower() == name.lower()]
		if recursive:
			for child in self.children:
				matches.extend(child.find_ignore_transient_objects(name, True))
		return matches
	def create(self, name, kind):
		child = Node(name, kind, self)
		self.children.append(child)
		return child
	def create_folder(self, name):
		self.create(name, "folder")
	def create_program(self, name): return self.create(name, "program")
	def create_function_block(self, name): return self.create(name, "function_block")
	def create_function(self, name, return_type): return self.create(name, "function")
	def create_gvl(self, name): return self.create(name, "gvl")
	def create_dut(self, name, kind, base): return self.create(name, kind)
	def create_interface(self, name): return self.create(name, "interface")
	def create_method(self, name, return_type): return self.create(name, "method")
	def create_action(self, name): return self.create(name, "action")
	def create_property(self, name, return_type):
		prop = self.create(name, "property")
		prop.create("Get", "get")
		prop.create("Set", "set")
		return prop


class CompilerFixture:
	def __init__(self):
		self.opened = []
		self.fail_compile = False
		self.empty_output = False
		self.engine = SimpleNamespace(
			projects=SimpleNamespace(open=self.open),
			DutType=SimpleNamespace(Structure="structure", Enumeration="enumeration", Union="union", Alias="alias"),
			Severity=SimpleNamespace(Error=1, FatalError=2),
			system=SimpleNamespace(get_message_categories=lambda: ["compiler"], get_message_objects=lambda category, severity: [], clear_messages=Mock()),
		)
	def open(self, path, primary):
		app = Node("Application", "application")
		app.create("MainTask", "task")
		background = app.create("BackgroundTask", "task")
		background.children.clear()
		background.pous.add("Monitor")
		app.create("Monitor", "program")
		app.create("Symbols", "symbols")
		app.create("PLC_PRG", "program")
		project = SimpleNamespace(path=path, close=Mock(), active_application=app)
		def save(): Path(project.path).write_text("compiled project")
		def save_as(destination):
			project.path = destination
			save()
		def rebuild():
			if self.fail_compile: raise RuntimeError("Fixture compiler error")
		def export(destination, update, compact):
			Path(destination).write_text("" if self.empty_output else "boot application")
		project.save, project.save_as = save, save_as
		app.clean, app.rebuild, app.generate_code = Mock(), rebuild, Mock()
		app.create_boot_application = export
		self.opened.append(project)
		return project


def spec(kind, name, children=None, folder=None, **kwargs):
	return dict(kind=kind, name=name, declaration="source " + name, children=children or [], folder=folder or [], **kwargs)


class BuildTests(unittest.TestCase):
	def setUp(self):
		self.temp = tempfile.TemporaryDirectory()
		self.addCleanup(self.temp.cleanup)
		self.root = Path(self.temp.name)
		self.template = self.root / "Template.project"
		self.template.write_text("original template")
		self.compiler = CompilerFixture()
		self.loaded = {}
		self.counter = 0
		self.objects = [spec("program", "Main", implementation="RETURN;")]
	def request(self, **overrides):
		self.counter += 1
		run = self.root / str(self.counter)
		run.mkdir()
		request = dict(template=str(self.template), templateHash=hashlib.sha256(self.template.read_bytes()).hexdigest(),
			project=str(run / "Application.project"), output=str(run / "Application.app"), receipt=str(run / "compiled.json"),
			objects=self.objects, entry="Main", task="MainTask", symbols=False, removeObjects=["PLC_PRG"], mode="build")
		request.update(overrides)
		return request
	def run_build(self, **overrides):
		request = self.request(**overrides)
		build(self.compiler.engine, request, self.loaded, str(self.root))
		return request
	def find(self, name):
		return self.loaded["project"].active_application.find_ignore_transient_objects(name, True)[0]
	def test_imports_program_and_rewires_only_the_configured_task(self):
		request = self.run_build()
		self.assertEqual(self.find("Main").implementation, "RETURN;")
		self.assertEqual(self.find("MainTask").calls, ["Main"])
		self.assertEqual(self.find("BackgroundTask").calls, ["Monitor"])
		self.assertTrue(Path(request["receipt"]).exists())
		self.assertEqual(self.template.read_text(), "original template")
	def test_reuses_the_loaded_project_for_text_changes(self):
		self.run_build()
		self.objects[0]["implementation"] = "NewBody();"
		self.run_build()
		self.assertEqual(len(self.compiler.opened), 1)
		self.assertEqual(self.find("Main").implementation, "NewBody();")
	def test_reloads_for_template_changes(self):
		self.run_build()
		self.template.write_text("changed template")
		self.run_build()
		self.assertEqual(len(self.compiler.opened), 2)
	def test_reloads_for_removed_children_and_moved_domains(self):
		block = spec("function_block", "FB_Test", [spec("method", "Run", implementation="RETURN;")], ["old"], implementation="")
		self.objects.append(block)
		self.run_build()
		block["children"] = []
		block["folder"] = ["new", "nested"]
		self.run_build()
		self.assertEqual(len(self.compiler.opened), 2)
		self.assertEqual(self.find("FB_Test").children, [])
		self.assertEqual(self.find("FB_Test").parent.name, "nested")
	def test_imports_every_supported_object_kind(self):
		self.objects.extend([
			spec("dut", "ST_Data", dutType="structure"), spec("dut", "E_State", dutType="enumeration"),
			spec("dut", "U_Data", dutType="union"), spec("dut", "T_Count", dutType="alias"),
			spec("gvl", "Globals"), spec("function", "F_Add", returnType="INT", implementation="F_Add := 1;"),
			spec("interface", "I_Test", [spec("method", "Run")]),
			spec("function_block", "FB_Test", [spec("action", "Reset", implementation="X := 0;"),
				spec("property", "Ready", [spec("get", "Get", implementation="Ready := TRUE;")], returnType="BOOL")], implementation=""),
		])
		self.run_build()
		self.assertEqual(self.find("Ready").children[0].implementation, "Ready := TRUE;")
		self.assertEqual([child.name for child in self.find("Ready").children], ["Get"])
		self.assertEqual(self.find("Reset").implementation, "X := 0;")
		self.assertEqual(self.find("T_Count").kind, "alias")
	def test_reports_missing_task_instead_of_leaving_entry_unscheduled(self):
		with self.assertRaisesRegex(RuntimeError, "one task named Missing"):
			self.run_build(task="Missing")
	def test_discards_a_failed_project_and_recovers_on_the_next_build(self):
		self.compiler.fail_compile = True
		request = self.request()
		with self.assertRaisesRegex(RuntimeError, "Fixture compiler error"):
			build(self.compiler.engine, request, self.loaded, str(self.root))
		self.assertEqual(self.loaded, {})
		self.assertFalse(Path(request["receipt"]).exists())
		self.compiler.opened[0].close.assert_called_once()
		self.compiler.fail_compile = False
		self.run_build()
		self.assertEqual(len(self.compiler.opened), 2)
	def test_rejects_empty_boot_application(self):
		self.compiler.empty_output = True
		with self.assertRaisesRegex(RuntimeError, "non-empty boot application"):
			self.run_build()
	def test_clears_old_diagnostics_before_compilation(self):
		self.run_build()
		self.compiler.engine.system.clear_messages.assert_called_once_with("compiler")
	def test_fails_on_compiler_error_diagnostics(self):
		self.compiler.engine.system.get_message_objects = lambda category, severity: [SimpleNamespace(text="Unresolved identifier")]
		with self.assertRaisesRegex(RuntimeError, "Unresolved identifier"):
			self.run_build()


if __name__ == "__main__":
	unittest.main()
