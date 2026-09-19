#!/bin/sh
set -eu

application_name=$1
config_dir=/conf/codesyscontrol
data_dir=/data/codesyscontrol
config_file=$config_dir/CODESYSControl_User.cfg

test -d "$config_dir"
test -d "$data_dir"
test -s /codesys-build/Application.app
test -s /codesys-build/Application.crc

# Match the Virtual Control image's first-start initialization before installing
# the application. Existing configuration, device users, licenses and data survive.
if [ ! -f "$config_dir/.docker_initialized" ]; then
	for file in CODESYSControl.cfg CODESYSControl_User.cfg; do
		if [ ! -f "$config_dir/$file" ]; then
			cp "/etc/codesyscontrol/$file" "$config_dir/$file"
		fi
	done
	touch "$config_dir/.docker_initialized"
fi
if [ ! -f "$data_dir/.docker_initialized" ]; then
	cp -a /var/opt/codesys/. "$data_dir/"
	touch "$data_dir/.docker_initialized"
fi

# Register the boot application once, retaining other applications and settings.
# Read the full section first so a new application index cannot overwrite one.
cp -p "$config_file" "$config_file.codesys-build.tmp"
awk -v application="$application_name" '
{
	if (FNR == 1) in_app = 0
	if (FILENAME == ARGV[2]) lines[++count] = $0
	line = $0
	sub(/\r$/, "", line)
	gsub(/^[ \t]+|[ \t]+$/, "", line)
	if (line ~ /^\[/) in_app = (line == "[CmpApp]")
	if (in_app && line ~ /^Application\.[0-9]+[ \t]*=/) {
		split(line, parts, "=")
		index_text = parts[1]
		sub(/^Application\./, "", index_text)
		if (index_text + 0 > maximum) maximum = index_text + 0
		value = parts[2]
		gsub(/^[ \t]+|[ \t]+$/, "", value)
		applications[index_text + 0] = value
	}
}
END {
	# User configuration overrides the base file for the same Application.N key.
	for (application_index in applications) {
		if (applications[application_index] == application) registered = 1
	}
	for (i = 1; i <= count; i++) {
		print lines[i]
		if (!registered && lines[i] ~ /^[ \t]*\[CmpApp\][ \t]*\r?$/) {
			print "Application." (maximum + 1) "=" application
			registered = 1
		}
	}
	if (!registered) print "\n[CmpApp]\nApplication." (maximum + 1) "=" application
}' "$config_dir/CODESYSControl.cfg" "$config_file" > "$config_file.codesys-build.tmp"
mv "$config_file.codesys-build.tmp" "$config_file"

# The runtime stays stopped until both boot files are installed. Keep retain files
# and application-owned data; this is a cold deployment, not an online change.
application_dir=$data_dir/PlcLogic/$application_name
mkdir -p "$application_dir"
for extension in app crc; do
	cp "/codesys-build/Application.$extension" "$application_dir/$application_name.$extension.tmp"
	mv "$application_dir/$application_name.$extension.tmp" "$application_dir/$application_name.$extension"
done
