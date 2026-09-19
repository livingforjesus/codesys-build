{attribute 'linkalways'}
{attribute 'qualified_only'}
(* Collection lane occupancy and capacity. *)
VAR_GLOBAL
	(* Collects empty bins released from framing stations. *)
	{attribute 'symbol' := 'readwrite'}
	Collection_EmptyBins : ST_LineCollection;
	(* Holds QC work for inspection and intervention. *)
	{attribute 'symbol' := 'readwrite'}
	Collection_QualityControl : ST_LineCollection;
	(* Collects boxed packages assigned to carrier 1. *)
	{attribute 'symbol' := 'readwrite'}
	Collection_Carrier01 : ST_LineCollection;
	(* Collects boxed packages assigned to carrier 2. *)
	{attribute 'symbol' := 'readwrite'}
	Collection_Carrier02 : ST_LineCollection;
	(* Collects boxed packages assigned to carrier 3. *)
	{attribute 'symbol' := 'readwrite'}
	Collection_Carrier03 : ST_LineCollection;
	(* Collects boxed packages assigned to carrier 4. *)
	{attribute 'symbol' := 'readwrite'}
	Collection_Carrier04 : ST_LineCollection;
END_VAR
