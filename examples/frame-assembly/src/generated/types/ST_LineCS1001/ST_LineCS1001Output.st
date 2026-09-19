(*
Auxiliary control signals and feedback for an Intelligrated CS1001 motor-driven roller card.
https://www.scribd.com/document/823553754/MDR-710-With-WWL-Installation-and-Maintenance-Manual
*)
TYPE ST_LineCS1001Output :
STRUCT
	(* Assert CN2-1 according to the installed SW2-6 setting. TRUE can force run or hold accumulation; FALSE can release accumulation. *)
	MotionAsserted : BOOL;
	(* CN2-2 role depends on card mode. Do not interpret as left/right diverter routing. *)
	DirectionOrSlaveErrorAsserted : BOOL;
	(* Optional CN2-3 reference in 0..10 V. Not metres/second and not a 4..20 mA signal. *)
	SpeedVolts : LREAL;
END_STRUCT
END_TYPE
