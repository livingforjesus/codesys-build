(*
Auxiliary control signals and feedback for an Intelligrated CS1001 motor-driven roller card.
https://www.scribd.com/document/823553754/MDR-710-With-WWL-Installation-and-Maintenance-Manual
*)
TYPE ST_LineCS1001Input :
STRUCT
	(* CN2-4 sensor indication; TRUE when the photoeye is blocked. *)
	Sensor : BOOL;
	(* CN2-5 aggregate error indication; no numeric diagnostic code is transmitted by this bit. *)
	Error : BOOL;
	(* CN2-6 warning indication. *)
	Warning : BOOL;
	(* CN2-7 synchronization indication; TRUE indicates motor running after polarity conversion. *)
	Sync : BOOL;
END_STRUCT
END_TYPE
