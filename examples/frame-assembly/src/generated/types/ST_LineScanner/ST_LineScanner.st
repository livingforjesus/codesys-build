(*
Cognex DataMan 374X EtherNet/IP signals from input assembly 11 and output assembly 21. Input is reader-to-PLC; Output is PLC-to-reader.
https://support.cognex.com/docs/dmst_2510/EN/Industrial_Protocols_Manual.pdf
*)
TYPE ST_LineScanner :
STRUCT
	(* Reader-to-PLC signals from input assembly 11. *)
	Input : ST_LineScannerInput;
	(* PLC-to-reader signals in output assembly 21. *)
	Output : ST_LineScannerOutput;
END_STRUCT
END_TYPE
