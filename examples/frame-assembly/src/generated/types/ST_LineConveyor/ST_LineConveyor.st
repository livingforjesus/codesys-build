(*
Chain status and individual Intelligrated CS1001 card controls and feedback for an MDR conveyor using B&R X67 I/O.
https://www.scribd.com/document/823553754/MDR-710-With-WWL-Installation-and-Maintenance-Manual
https://www.br-automation.com/en-in/products/io-systems/x67-system/bus-controller-modules/x67bcd321l12/
*)
TYPE ST_LineConveyor :
STRUCT
	(* Assigned CS1001 cards in slots 1..CardCount; 0 means none assigned. Maximum 128. *)
	CardCount : UINT;
	(* Intelligrated CS1001 cards controlling this conveyor, with individual control outputs and feedback. *)
	Cards : ARRAY[1..128] OF ST_LineCS1001;
	(* Aggregate status over explicitly configured chain members. *)
	Status : ST_LineConveyorStatus;
END_STRUCT
END_TYPE
