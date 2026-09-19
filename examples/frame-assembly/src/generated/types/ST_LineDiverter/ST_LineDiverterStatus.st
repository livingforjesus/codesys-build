(*
Card controls, routing context, and transfer status for an Intelligrated diverter assembly with two CS1001 cards, a ZoneMax device, and approximately two or three B&R X67 modules.
https://www.scribd.com/document/823553754/MDR-710-With-WWL-Installation-and-Maintenance-Manual
*)
TYPE ST_LineDiverterStatus :
STRUCT
	(* FALSE until the owning PLC logic supplies a current status; FALSE on stale or unavailable inputs. *)
	Valid : BOOL;
	(* Committed transfer route, not a measured actuator position. LineConstants.Route*: 0=none/hold, 1=through, 2=left, 3=right. Logical ports; no actuator wiring implied. *)
	ActiveRoute : INT;
	(* Transfer is in progress until configured arrival feedback completes it. *)
	Busy : BOOL;
	(* Fault in the actuator interface or transfer sequence. *)
	Faulted : BOOL;
	(* Payload currently committed to a transfer; cleared once arrival is confirmed. *)
	TransferPayload : STRING(80);
END_STRUCT
END_TYPE
