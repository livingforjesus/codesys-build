"""Runs inside CODESYS's Python engine, not the Mac's Python installation."""
from __future__ import print_function

import io
import json
import os
import shutil
import tempfile
import time


def fail_on_errors(engine):
	errors = []
	for category in engine.system.get_message_categories():
		errors.extend(engine.system.get_message_objects(
			category, engine.Severity.Error | engine.Severity.FatalError,
		))
	if errors:
		raise RuntimeError("CODESYS errors:\n" + "\n".join(error.text for error in errors))


def object_key(spec):
	return (spec["kind"], spec["name"], tuple(spec.get("folder", [])),
		tuple(object_key(child) for child in spec.get("children", [])))


def project_key(request):
	return (request["templateHash"], request["entry"], request["task"],
		tuple(request["removeObjects"]), request["symbols"],
		tuple(object_key(spec) for spec in request["objects"]))


def unique_child(parent, name):
	matches = parent.find_ignore_transient_objects(name, False)
	if len(matches) > 1:
		raise RuntimeError("Ambiguous child " + name)
	return matches[0] if matches else None


def create_object(engine, parent, spec):
	kind, name = spec["kind"], spec["name"]
	if kind == "dut":
		dut_types = {"structure": engine.DutType.Structure, "enumeration": engine.DutType.Enumeration,
			"union": engine.DutType.Union, "alias": engine.DutType.Alias}
		subtype = spec["dutType"]
		# The complete declaration replaces this valid creation placeholder below.
		return parent.create_dut(name, dut_types[subtype], "INT" if subtype == "alias" else None)
	if kind == "gvl":
		return parent.create_gvl(name)
	if kind == "program":
		return parent.create_program(name)
	if kind == "function_block":
		return parent.create_function_block(name)
	if kind == "function":
		# The creation API requires a type even for a no-return function. Importing
		# its complete declaration below replaces this temporary BOOL header.
		return parent.create_function(name, spec.get("returnType", "BOOL"))
	if kind == "interface":
		return parent.create_interface(name)
	if kind == "method":
		return parent.create_method(name, spec.get("returnType"))
	if kind == "property":
		return parent.create_property(name, spec["returnType"])
	if kind == "action":
		return parent.create_action(name)
	if kind in ("get", "set"):
		# CODESYS creates accessors with the property, not with create_method.
		obj = unique_child(parent, name)
		if obj is None:
			raise RuntimeError("Property accessor is missing: " + name)
		return obj
	raise RuntimeError("Unsupported IEC object kind " + kind)


def import_object(engine, parent, spec):
	obj = unique_child(parent, spec["name"])
	if obj is None:
		obj = create_object(engine, parent, spec)
	if spec["kind"] != "action":
		obj.textual_declaration.replace(spec["declaration"])
	if "implementation" in spec:
		obj.textual_implementation.replace(spec["implementation"])
	children = spec.get("children", [])
	if spec["kind"] == "property":
		# Remove default accessors absent from source (e.g. a read-only property).
		names = set(child["name"].lower() for child in children)
		for child in list(obj.get_children()):
			if child.get_name().lower() in ("get", "set") and child.get_name().lower() not in names:
				child.remove()
	for child in children:
		import_object(engine, obj, child)


def import_objects(engine, application, request, reusing, progress):
	progress("Importing source objects")
	if not reusing:
		for name in request["removeObjects"]:
			for obj in application.find_ignore_transient_objects(name, True):
				obj.remove()
		# Source objects own their complete subtree, including removed methods.
		for spec in request["objects"]:
			existing = application.find_ignore_transient_objects(spec["name"], True)
			if len(existing) > 1:
				raise RuntimeError("Ambiguous IEC object " + spec["name"])
			for obj in existing:
				obj.remove()
	for spec in request["objects"]:
		parent = application
		for name in spec["folder"]:
			folder = unique_child(parent, name)
			if folder is None:
				# create_folder returns None in CODESYS; resolve the inserted object.
				parent.create_folder(name)
				folder = unique_child(parent, name)
				if folder is None:
					raise RuntimeError("Could not create source folder " + name)
			elif not folder.is_folder:
				raise RuntimeError("Source folder conflicts with IEC object " + name)
			parent = folder
		import_object(engine, parent, spec)
	matches = application.find_ignore_transient_objects(request["task"], True)
	if len(matches) != 1 or not getattr(matches[0], "is_task", False):
		raise RuntimeError("Template must contain one task named " + request["task"])
	task = matches[0]
	# Only this configured task is rewired; its timing and watchdog stay in the template.
	if list(task.pous) == [request["entry"]]:
		return
	# Task calls are transient children. Remove the call objects themselves;
	# ScriptPouObjectList.remove can change its list without removing those objects.
	for call in list(task.get_children()):
		call.remove()
	task.pous.add(request["entry"])
	if list(task.pous) != [request["entry"]]:
		raise RuntimeError("Could not configure the entry task: " + repr(list(task.pous)))



def build(engine, request, loaded, workspace):
	progress_path = os.path.join(os.path.dirname(request["receipt"]), "progress.log")

	def progress(stage):
		with io.open(progress_path, "a", encoding="utf-8") as log:
			log.write(u"{0}Z {1}\n".format(
				time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()), stage,
			))

	# Reopen when the template or object membership changes, so removed/renamed
	# declarations cannot survive from an earlier build. Text changes are imported below.
	key = project_key(request)
	reusing = loaded.get("key") == key
	project = None
	try:
		if reusing:
			progress("Reusing loaded project")
			project = loaded["project"]
		else:
			if loaded.get("project") is not None:
				loaded["project"].close()
			loaded.clear()
			progress("Opening project")
			project = engine.projects.open(request["template"], primary=True)
			working = tempfile.mkdtemp(prefix="project-", dir=workspace)
			project.save_as(os.path.join(working, "Application.project"))
		loaded.clear()
		application = project.active_application
		if application is None:
			raise RuntimeError("Template must have an active Application")
		import_objects(engine, application, request, reusing, progress)
		if request["symbols"] and not any(
			getattr(child, "is_symbol_config", False)
			for child in application.get_children()
		):
			from System import Guid
			application.create_symbol_config(True, True, Guid("{0141eb75-141b-4ea1-9a8c-75f952b22a6c}"))
		progress("Saving generated project")
		project.save()
		progress("Clearing previous diagnostics")
		# Check diagnostics from this compilation, not cached editor-load messages.
		for category in engine.system.get_message_categories():
			engine.system.clear_messages(category)
		progress("Rebuilding application")
		application.clean()
		application.rebuild()
		fail_on_errors(engine)
		progress("Generating application code")
		application.generate_code()
		fail_on_errors(engine)
		project.save()
		# Keep the open file private to the worker. Each run gets a saved snapshot
		# that the interactive IDE can open without conflicting with the worker.
		shutil.copyfile(project.path, request["project"])
		progress("Exporting boot application")
		application.create_boot_application(request["output"], False, False)
		fail_on_errors(engine)
		if not os.path.isfile(request["output"]) or os.path.getsize(request["output"]) == 0:
			raise RuntimeError("Compiler did not produce a non-empty boot application")
		progress("Build complete")
		with io.open(request["receipt"], "w", encoding="utf-8") as receipt:
			receipt.write(json.dumps(
				{"mode": request["mode"], "output": request["output"]},
				ensure_ascii=False,
			))
		loaded.update({"key": key, "project": project})
	except Exception:
		loaded.clear()
		if project is not None:
			# Never retain a partially imported/compiled project after failure.
			try:
				if os.path.normcase(project.path) != os.path.normcase(request["template"]):
					project.save()
					shutil.copyfile(project.path, request["project"])
			except Exception:
				print("Could not save the diagnostic project")
			finally:
				project.close()
		raise
