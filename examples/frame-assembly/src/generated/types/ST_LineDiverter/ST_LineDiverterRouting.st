(*
Card controls, routing context, and transfer status for an Intelligrated diverter assembly with two CS1001 cards, a ZoneMax device, and approximately two or three B&R X67 modules.
https://www.scribd.com/document/823553754/MDR-710-With-WWL-Installation-and-Maintenance-Manual
*)
TYPE ST_LineDiverterRouting :
STRUCT
	(* 0=unknown; 1..4=configured carrier lane. Unknown must hold. *)
	CarrierDestination : INT;
	(* Identity to which the requested route applies. *)
	CommandPayload : STRING(80);
	(* LineConstants.Destination*: 0=unknown, 1=framing, 2=canvas, 3=oversize. *)
	DestinationType : INT;
	(* Payload is a bin with no remaining orders. *)
	EmptyBin : BOOL;
	(* Payload contains work requiring QC intervention. *)
	HasQC : BOOL;
	(* Derived from receiving sensors, enable state, and reservations; not a scanner observation. *)
	ReceivingAvailable : BOOL;
	(* Assigned station identity. Direction is resolved by configured port mapping. *)
	TargetStation : STRING(80);
END_STRUCT
END_TYPE
