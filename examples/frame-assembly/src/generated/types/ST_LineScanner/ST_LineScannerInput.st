(*
Cognex DataMan 374X EtherNet/IP signals from input assembly 11 and output assembly 21. Input is reader-to-PLC; Output is PLC-to-reader.
https://support.cognex.com/docs/dmst_2510/EN/Industrial_Protocols_Manual.pdf
*)
TYPE ST_LineScannerInput :
STRUCT
	(* Ready to accept an EtherNet/IP trigger; byte 0 bit 0. *)
	TriggerReady : BOOL;
	(* Acknowledges Trigger and remains set until Trigger is cleared; byte 0 bit 1. *)
	TriggerAck : BOOL;
	(* Image acquisition is in progress; byte 0 bit 2. *)
	Acquiring : BOOL;
	(* An acquisition trigger was missed; cleared by the next successful acquisition; byte 0 bit 3. *)
	MissedAcq : BOOL;
	(* Toggles for each completed decode, including no-read results; byte 1 bit 1. *)
	DecodeCompleteToggle : BOOL;
	(* A result was discarded because the results queue was full; byte 1 bit 2. *)
	ResultsBufferOverrun : BOOL;
	(* Result metadata and data are available for consumption; byte 1 bit 3. *)
	ResultsAvailable : BOOL;
	(* Reader-reported general fault indication; byte 1 bit 7. *)
	GeneralFault : BOOL;
	(* Software-event acknowledgements, bits corresponding to Output.SoftEvent; byte 2. *)
	SoftEventAck : BYTE;
	(* 16-bit identifier of the next trigger; bytes 6-7. *)
	TriggerID : UINT;
	(* Trigger identifier associated with these results; bytes 8-9. *)
	ResultID : UINT;
	(* Result flags: bit 0 read, 1 validated, 2 verified, 3 trigger overrun, 4 acquisition buffer overflow; bytes 10-11. *)
	ResultCode : WORD;
	(* Unused result extension word in the documented assembly; bytes 12-13. *)
	ResultExtended : WORD;
	(* Number of result bytes to consume from ResultData; bytes 14-15. *)
	ResultLength : UINT;
	(* Decode-result bytes, preserving the reader's configured output format; assembly bytes 16-499. *)
	ResultData : ARRAY[0..483] OF BYTE;
END_STRUCT
END_TYPE
