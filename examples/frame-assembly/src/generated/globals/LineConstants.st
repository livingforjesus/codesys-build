{attribute 'qualified_only'}
(* Application encodings, not hardware addresses. *)
VAR_GLOBAL CONSTANT
	ConveyorCardCapacity : INT := 128;
	RouteNone : INT := 0;
	RouteThrough : INT := 1;
	RouteLeft : INT := 2;
	RouteRight : INT := 3;
	DestinationUnknown : INT := 0;
	DestinationFraming : INT := 1;
	DestinationCanvas : INT := 2;
	DestinationOversize : INT := 3;
END_VAR
