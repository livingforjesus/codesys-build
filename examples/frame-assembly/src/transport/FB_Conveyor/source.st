FUNCTION_BLOCK FB_Conveyor EXTENDS FB_BaseDrive IMPLEMENTS I_Actuator
VAR
	Enabled : BOOL;
	Speed : INT;
	Cycles : UDINT;
	Diagnostic : STRING(80) := 'Contains END_VAR and escaped $'quotes$'';
END_VAR
IF Enabled THEN
	Cycles := Cycles + 1;
END_IF
END_FUNCTION_BLOCK
