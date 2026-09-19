(*
Card controls, routing context, and transfer status for an Intelligrated diverter assembly with two CS1001 cards, a ZoneMax device, and approximately two or three B&R X67 modules.
https://www.scribd.com/document/823553754/MDR-710-With-WWL-Installation-and-Maintenance-Manual
*)
TYPE ST_LineDiverter :
STRUCT
	(* Two Intelligrated CS1001 cards in the diverter assembly; each card has its own control outputs and feedback. *)
	Cards : ARRAY[1..2] OF ST_LineCS1001;
	(* Transfer sequence observations; these are not CS1001 registers. *)
	Status : ST_LineDiverterStatus;
	(* PLC-owned routing context, never mapped directly to electrical outputs. *)
	Routing : ST_LineDiverterRouting;
END_STRUCT
END_TYPE
