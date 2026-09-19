{attribute 'linkalways'}
{attribute 'qualified_only'}
(* Conveyor line devices and operator controls. *)
VAR_GLOBAL
	(* MDR driver card chain *)
	{attribute 'symbol' := 'readwrite'}
	Conveyor_Inbound : ST_LineConveyor;
	(* MDR driver card chain *)
	{attribute 'symbol' := 'readwrite'}
	Conveyor_Outbound : ST_LineConveyor;
	(* MDR driver card chain *)
	{attribute 'symbol' := 'readwrite'}
	Conveyor_CarrierSorting : ST_LineConveyor;
	(* Cognex 374X for identifying over sized orders for diverter *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_Oversize : ST_LineScanner;
	(* Cognex 374X for identifying canvas orders for diverter *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_Canvas : ST_LineScanner;
	(* Cognex 374X for sending order data to fraiming station 1 or 2 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_FramingPair01 : ST_LineScanner;
	(* Cognex 374X for sending order data to fraiming station 3 or 4 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_FramingPair02 : ST_LineScanner;
	(* Cognex 374X for sending order data to fraiming station 5 or 6 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_FramingPair03 : ST_LineScanner;
	(* Cognex 374X for sending order data to fraiming station 7 or 8 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_FramingPair04 : ST_LineScanner;
	(* Cognex 374X for sending order data to fraiming station 9 or 10 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_FramingPair05 : ST_LineScanner;
	(* Cognex 374X for sending order data to fraiming station 11 or 12 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_FramingPair06 : ST_LineScanner;
	(* Cognex 374X for identifying empty bin for diverter *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_EmptyBinCollection : ST_LineScanner;
	(* Cognex 374X for identifying QC flagged orders for diverter *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_QualityControl : ST_LineScanner;
	(* Cognex 374X sending order data to shrink wrap station 1 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_ShrinkWrap01 : ST_LineScanner;
	(* Cognex 374X sending order data to shrink wrap station 2 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_ShrinkWrap02 : ST_LineScanner;
	(* Cognex 374X sending order data to bubble wrap station 1 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_BubbleWrap01 : ST_LineScanner;
	(* Cognex 374X sending order data to bubble wrap station 2 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_BubbleWrap02 : ST_LineScanner;
	(* Cognex 374X sending order data to boxing station 1 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_Boxing01 : ST_LineScanner;
	(* Cognex 374X sending order data to boxing station 2 *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_Boxing02 : ST_LineScanner;
	(* Cognex 374X for diverting to carrier destination *)
	{attribute 'symbol' := 'readwrite'}
	Scanner_CarrierSorting : ST_LineScanner;
	(* Photo-eye used to for final back up dectection to prompt stopping of the diverter *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Oversize_BackupLimit : ST_LinePhotoeye;
	(* Photo-eye used for initial warning of backup of orders in oversized order direction *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Oversize_BackupWarning : ST_LinePhotoeye;
	(* Photo-eye used to for final back up dectection to prompt stopping of the diverter *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Canvas_BackupLimit : ST_LinePhotoeye;
	(* Photo-eye used for initial warning of backup of orders in canvas direction *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Canvas_BackupWarning : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 1 for Div_FS_1 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing01_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 1 for Div_FS_1 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing01_DivertFeedback : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 2 for Div_FS_1 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing02_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 2 for Div_FS_1 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing02_DivertFeedback : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 3 for Div_FS_2 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing03_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 3 for Div_FS_2 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing03_DivertFeedback : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 4 for Div_FS_2 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing04_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 4 for Div_FS_2 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing04_DivertFeedback : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 5 for Div_FS_3 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing05_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 5 for Div_FS_3 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing05_DivertFeedback : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 6 for Div_FS_3 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing06_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 6 for Div_FS_3 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing06_DivertFeedback : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 7 for Div_FS_4 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing07_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 7 for Div_FS_4 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing07_DivertFeedback : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 8 for Div_FS_4 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing08_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 8 for Div_FS_4 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing08_DivertFeedback : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 9 for Div_FS_5 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing09_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 9 for Div_FS_5 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing09_DivertFeedback : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 10 for Div_FS_5 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing10_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 10 for Div_FS_5 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing10_DivertFeedback : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 11 for Div_FS_6 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing11_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 11 for Div_FS_6 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing11_DivertFeedback : ST_LinePhotoeye;
	(* Photo-eye used for order detection at fraiming station 12 for Div_FS_6 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing12_Presence : ST_LinePhotoeye;
	(* Photo-eye used for duration of divert at fraiming station 12 for Div_FS_6 *)
	{attribute 'symbol' := 'readwrite'}
	Photoeye_Framing12_DivertFeedback : ST_LinePhotoeye;
	(* Diverts orders right if identified as oversized *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_Oversize : ST_LineDiverter;
	(* Diverts orders right if identified as as canvas *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_Canvas : ST_LineDiverter;
	(* Diverts orders between fraiming stations 1 and 2 *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_FramingPair01 : ST_LineDiverter;
	(* Diverts orders between fraiming stations 3 and 4 *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_FramingPair02 : ST_LineDiverter;
	(* Diverts orders between fraiming stations 5 and 6 *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_FramingPair03 : ST_LineDiverter;
	(* Diverts orders between fraiming stations 7 and 8 *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_FramingPair04 : ST_LineDiverter;
	(* Diverts orders between fraiming stations 9 and 10 *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_FramingPair05 : ST_LineDiverter;
	(* Diverts orders between fraiming stations 11 and 12 *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_FramingPair06 : ST_LineDiverter;
	(* Diverts empty bins right; normal orders and QC work continue straight. *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_EmptyBinCollection : ST_LineDiverter;
	(* Diverts orders flagged QC right and passes through all others *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_QualityControl : ST_LineDiverter;
	(* Diverts all right *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_ShrinkWrap01 : ST_LineDiverter;
	(* Diverts orders right labled (Carrier 1), passes through all others *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_Carrier01 : ST_LineDiverter;
	(* Diverts orders right labled (Carrier 2), passes through all others *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_Carrier02 : ST_LineDiverter;
	(* Diverts orders right labled (Carrier 3), passes through all others *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_Carrier03 : ST_LineDiverter;
	(* Diverts orders right labled (Carrier 4), passes through all others *)
	{attribute 'symbol' := 'readwrite'}
	Diverter_Carrier04 : ST_LineDiverter;
	(* Distributes orders between the two shrink-wrap approach conveyors. *)
	{attribute 'symbol' := 'readwrite'}
	SIM_Diverter_ShrinkWrapLoadBalancer : ST_LineDiverter;
	(* Push button for overall system activation *)
	{attribute 'symbol' := 'readwrite'}
	Button_SystemStart01 : ST_LineButton;
	(* Push button for overall system activation *)
	{attribute 'symbol' := 'readwrite'}
	Button_SystemStart02 : ST_LineButton;
	(* Push button for overall system activation *)
	{attribute 'symbol' := 'readwrite'}
	Button_SystemStart03 : ST_LineButton;
	(* Push button for overall system deactivation *)
	{attribute 'symbol' := 'readwrite'}
	Button_SystemStop01 : ST_LineButton;
	(* Push button for overall system deactivation *)
	{attribute 'symbol' := 'readwrite'}
	Button_SystemStop02 : ST_LineButton;
	(* Push button for overall system deactivation *)
	{attribute 'symbol' := 'readwrite'}
	Button_SystemStop03 : ST_LineButton;
	(* Emergency stop for system *)
	{attribute 'symbol' := 'readwrite'}
	SIM_EmergencyStop01 : ST_LineEstop;
	(* Emergency stop for system *)
	{attribute 'symbol' := 'readwrite'}
	SIM_EmergencyStop02 : ST_LineEstop;
	(* Emergency stop for system *)
	{attribute 'symbol' := 'readwrite'}
	SIM_EmergencyStop03 : ST_LineEstop;
	(* Stack light for overall system status *)
	{attribute 'symbol' := 'readwrite'}
	StackLight_System01 : ST_LineLight;
	(* Stack light for overall system status *)
	{attribute 'symbol' := 'readwrite'}
	StackLight_System02 : ST_LineLight;
	(* Stack light for overall system status *)
	{attribute 'symbol' := 'readwrite'}
	StackLight_System03 : ST_LineLight;
	(* Alarm rings briefly as conveyor system activates, connected to stack light *)
	{attribute 'symbol' := 'readwrite'}
	Alarm_SystemStartup : ST_LineAlarm;
END_VAR
