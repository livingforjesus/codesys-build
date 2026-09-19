(*
Collection lane capacity, occupancy count, and full status.
*)
TYPE ST_LineCollection :
STRUCT
	(* Maximum occupants; zero means not configured and must inhibit admission. *)
	Capacity : UINT;
	(* FALSE until the owning PLC logic supplies a current status; FALSE on stale or unavailable inputs. *)
	Valid : BOOL;
	(* Payloads physically confirmed in this collection lane. *)
	Count : UINT;
	(* Admission blocked by capacity or the configured full sensor. *)
	Full : BOOL;
END_STRUCT
END_TYPE
