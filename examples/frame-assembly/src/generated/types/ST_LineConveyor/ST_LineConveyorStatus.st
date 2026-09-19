(*
Chain status and individual Intelligrated CS1001 card controls and feedback for an MDR conveyor using B&R X67 I/O.
https://www.scribd.com/document/823553754/MDR-710-With-WWL-Installation-and-Maintenance-Manual
https://www.br-automation.com/en-in/products/io-systems/x67-system/bus-controller-modules/x67bcd321l12/
*)
TYPE ST_LineConveyorStatus :
STRUCT
	(* FALSE until the owning PLC logic supplies a current status; FALSE on stale or unavailable inputs. *)
	Valid : BOOL;
	(* All assigned I/O transports exchanging current data. Does not prove power or wiring at each motor card. *)
	Connected : BOOL;
	(* At least one configured equipment fault is active. Interpret FALSE only with FaultFeedbackValid. *)
	Faulted : BOOL;
	(* All required chain fault observations are assigned and current. *)
	FaultFeedbackValid : BOOL;
	(* At least one configured roller reports running, based on feedback rather than control outputs. *)
	Running : BOOL;
	(* All required chain running observations are assigned and current. Leave FALSE if unavailable. *)
	RunningFeedbackValid : BOOL;
END_STRUCT
END_TYPE
