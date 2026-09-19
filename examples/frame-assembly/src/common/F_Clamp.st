FUNCTION F_Clamp : INT
VAR_INPUT
	Value : INT;
	Low : INT;
	High : INT;
END_VAR
F_Clamp := MIN(MAX(Value, Low), High);
END_FUNCTION
