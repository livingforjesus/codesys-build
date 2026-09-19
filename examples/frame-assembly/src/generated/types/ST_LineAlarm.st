(*
Audible alarm command for the conveyor system startup warning.
*)
TYPE ST_LineAlarm :
STRUCT
	(* Requests the audible startup warning. *)
	Active : BOOL;
END_STRUCT
END_TYPE
