(*
Operator station admission, active work, waiting queue, incoming reservations, and completed work awaiting release.
*)
TYPE ST_LineStation :
STRUCT
	(* Allow new admissions. Disabling does not erase existing work or reservations. *)
	Enabled : BOOL;
	(* Waiting plus incoming reservation slots; active work is separate. *)
	ReserveCapacity : UINT := 1;
	(* FALSE until the owning PLC logic supplies a current status; FALSE on stale or unavailable inputs. *)
	Valid : BOOL;
	(* Active work payload identity. *)
	ActiveId : STRING(80);
	(* Derived admission permission including QueueFull, enable, reservations, and transfer state. *)
	CanAcceptBin : BOOL;
	(* Work completed but still physically occupies the station until outbound admission. *)
	CompletedAwaitingRelease : BOOL;
	(* Derived from configured queue sensors; do not assume suffix _1 or _2 identifies a full sensor. *)
	QueueFull : BOOL;
	(* Incoming payloads holding a waiting slot, not yet physically arrived. *)
	ReservationCount : UINT;
	(* Physically arrived waiting payloads, excluding active work and incoming reservations. *)
	WaitingCount : UINT;
END_STRUCT
END_TYPE
