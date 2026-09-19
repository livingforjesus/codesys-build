(*
Separate green and red lamp outputs for a two-lamp stack light. PLC logic selects the indication and times red flashing for faults.
*)
TYPE ST_LineLight :
STRUCT
	(* Switches the green lamp on when TRUE. *)
	Green : BOOL;
	(* Switches the red lamp on when TRUE; toggle in PLC logic to flash. *)
	Red : BOOL;
END_STRUCT
END_TYPE
