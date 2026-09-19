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
