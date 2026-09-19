(*
Cognex DataMan 374X EtherNet/IP signals from input assembly 11 and output assembly 21. Input is reader-to-PLC; Output is PLC-to-reader.
https://support.cognex.com/docs/dmst_2510/EN/Industrial_Protocols_Manual.pdf
*)
TYPE ST_LineScannerOutput :
STRUCT
	(* Enables EtherNet/IP triggering; byte 0 bit 0. *)
	TriggerEnable : BOOL;
	(* Acquisition request; hold until TriggerAck, then clear; byte 0 bit 1. *)
	Trigger : BOOL;
	(* Holds queued results until the ResultsAck handshake; byte 0 bit 2. *)
	BufferResultsEnable : BOOL;
	(* Acknowledges consumed results; clear after ResultsAvailable clears; byte 0 bit 3. *)
	ResultsAck : BOOL;
	(* Rising-edge requests: bits 0 train code, 1 train match string, 2 train focus, 3 train brightness, 4 untrain, 6 execute DMCC, 7 set match string; bit 5 reserved. Byte 1. *)
	SoftEvent : BYTE;
	(* User-data option word from the documented assembly; bytes 4-5. *)
	UserDataOption : WORD;
	(* Number of user-data bytes supplied to the reader; bytes 6-7. *)
	UserDataLength : UINT;
	(* User-data bytes for supported operations such as DMCC and match-string commands; assembly bytes 8-499. *)
	UserData : ARRAY[0..491] OF BYTE;
END_STRUCT
END_TYPE
