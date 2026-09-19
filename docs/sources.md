# Source conventions and parser contract

## Objects and ownership

Plain directories are domain folders mirrored in the generated CODESYS application. A directory containing its own object source owns that object's child collections:

- `methods/`: METHOD objects, attached to a program, function block or interface.
- `properties/`: PROPERTY declarations, with optional getter/setter implementations on concrete POUs.
- `actions/`: ST implementation-only files, attached to programs or function blocks.

Functions, global lists and DUTs do not own methods. An object directory is identified by `source.st`, a declaration/implementation pair named after the directory, or generic `declaration.st` and `implementation.st`. The header's name must match the object filename/directory, ignoring case.

Methods support the same single-file, generic-pair and named-pair layouts as top-level POUs. Repeated method names on different parents are valid. Duplicate names within one parent's children are rejected. Put an object's child collections inside its object directory; a flat POU in an unrelated domain does not acquire arbitrary sibling folders as children.

## Complete files

```iecst
METHOD PUBLIC SetEnabled
VAR_INPUT
	Asserted : BOOL;
END_VAR
VAR_INST
	Calls : UDINT;
END_VAR

Enabled := Asserted;
Calls := Calls + 1;
END_METHOD
```

The parser splits original text at the declaration boundary and removes the outer closing keyword before populating the two CODESYS text buffers. It preserves source spelling, comments, pragmas and line endings. Whitespace/comments after the final declaration belong to the implementation. A trailing comment after `END_*` is preserved in the implementation as well.

Complete executable objects require their matching terminator. Split declaration files omit the terminator and contain no executable statements; implementation files contain only the body. Split implementation files pass their text directly to CODESYS, which is useful for implementation syntax outside the combined-file parser's grammar. Their declaration files still use the same declaration parser.

DUTs contain one `TYPE ... END_TYPE` object per file. Structures, enums, unions and aliases are supported. GVLs contain one or more `VAR_GLOBAL ... END_VAR` sections or `VAR_CONFIG` sections, with applicable attributes/qualifiers. A global's name is its filename without `.st`; it is not rewritten or stripped of a prefix.

## Interfaces and properties

An interface folder contains `source.st` (`INTERFACE ... END_INTERFACE`) and method/property signature files. Interface methods and properties are declaration-only and may omit their `END_METHOD`/`END_PROPERTY`. They cannot have implementations.

A concrete property lives in a folder:

```text
properties/
  IsRunning/
    declaration.st   # PROPERTY PUBLIC IsRunning : BOOL
    get.st           # IsRunning := Enabled;
```

Add `set.st` for a writable property. Accessors may start with local `VAR ... END_VAR` sections, followed by their implementation. They have no METHOD/PROPERTY header or enclosing terminator. Only the accessors present in source remain in the generated property. Actions likewise contain only implementation text.

## Syntax recognized by the splitter

- PROGRAM, FUNCTION_BLOCK, FUNCTION and METHOD headers.
- Optional function return values; optional same-line header/END_VAR semicolons and outer terminator semicolons.
- Access/inheritance modifiers, qualified return types, pointer/reference types, strings with lengths, array return types and generic type arguments.
- EXTENDS and IMPLEMENTS clauses, including clauses following `VAR_GENERIC CONSTANT`.
- VAR, VAR_INPUT, VAR_OUTPUT, VAR_IN_OUT, VAR_TEMP, VAR_STAT, VAR_INST, VAR_EXTERNAL, VAR_ACCESS and VAR_GENERIC sections, with qualifiers such as CONSTANT/RETAIN/PERSISTENT.
- Case-insensitive keywords, UTF-8 BOMs, LF/CRLF/CR line endings.
- Line comments, nested `(* ... *)` comments, STRING/WSTRING literals with `$` escapes, and declaration pragmas.
- Conditional member declarations wholly contained within a variable section, and conditional pragmas in executable code.

This is an envelope/declaration parser, not an IEC compiler. Variable types, initializer validity, executable expressions, inheritance legality and target-specific restrictions are validated by CODESYS. For example, recognizing a VAR section does not mean it is legal in every POU kind.

Unsupported combined-file syntax fails explicitly where recognizable. There is no fallback that guesses a boundary after a parser error. Conditional compilation wrapping whole declaration sections, multiple/nested POUs in one file, and graphical implementations (LD/FBD/CFC/SFC/UML) are not supported. Keep nested methods/properties in child files. This package does not implement the CODESYS File-Based Storage serialization format.

Source symlinks are rejected. Non-`.st` files are ignored. Avoid unrelated `.st` examples/backups inside the configured source tree: every source there must form a valid object. Folder names do not create namespaces, so two domains cannot define separate application objects with the same IEC name.

`OVERRIDE` is also a valid object name. When used as a modifier, put the following name on the same line. Same-line header/END_VAR semicolons belong to the declaration; a semicolon on the next line is an empty implementation statement. Pragmas before another declaration section belong to the declaration, while trailing pragmas remain in the implementation. Use explicit pairs when an intended boundary cannot be inferred from these conventions.

See the [parser audit](parser-audit.md) for real-code corpus results, regression cases, generated inputs and remaining limitations.
