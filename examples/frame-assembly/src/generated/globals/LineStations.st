{attribute 'linkalways'}
{attribute 'qualified_only'}
(* Operator station work, queues, and incoming reservations. *)
VAR_GLOBAL
	(* Framing station 1: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing01 : ST_LineStation;
	(* Framing station 2: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing02 : ST_LineStation;
	(* Framing station 3: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing03 : ST_LineStation;
	(* Framing station 4: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing04 : ST_LineStation;
	(* Framing station 5: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing05 : ST_LineStation;
	(* Framing station 6: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing06 : ST_LineStation;
	(* Framing station 7: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing07 : ST_LineStation;
	(* Framing station 8: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing08 : ST_LineStation;
	(* Framing station 9: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing09 : ST_LineStation;
	(* Framing station 10: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing10 : ST_LineStation;
	(* Framing station 11: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing11 : ST_LineStation;
	(* Framing station 12: receives picking bins and releases individually assembled orders. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Framing12 : ST_LineStation;
	(* Receives oversized orders for assembly and packaging. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Oversize : ST_LineStation;
	(* Receives canvas orders for operator processing. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Canvas : ST_LineStation;
	(* ShrinkWrap station 1: applies shrink-wrap and binds a process tag to each order. *)
	{attribute 'symbol' := 'readwrite'}
	Station_ShrinkWrap01 : ST_LineStation;
	(* ShrinkWrap station 2: applies shrink-wrap and binds a process tag to each order. *)
	{attribute 'symbol' := 'readwrite'}
	Station_ShrinkWrap02 : ST_LineStation;
	(* BubbleWrap station 1: adds bubble wrap and end-cap protection while preserving the process tag. *)
	{attribute 'symbol' := 'readwrite'}
	Station_BubbleWrap01 : ST_LineStation;
	(* BubbleWrap station 2: adds bubble wrap and end-cap protection while preserving the process tag. *)
	{attribute 'symbol' := 'readwrite'}
	Station_BubbleWrap02 : ST_LineStation;
	(* Boxing station 1: boxes each order and completes its shipping label. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Boxing01 : ST_LineStation;
	(* Boxing station 2: boxes each order and completes its shipping label. *)
	{attribute 'symbol' := 'readwrite'}
	Station_Boxing02 : ST_LineStation;
END_VAR
