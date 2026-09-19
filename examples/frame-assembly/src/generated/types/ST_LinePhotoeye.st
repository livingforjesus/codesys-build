(*
Detection and alarm signals from a SICK RT-P4000S02 photoelectric proximity sensor.
https://www.sick.com/media/docs/7/07/907/operating_instructions_rt_photoelectric_proximity_sensor_de_en_fr_zh_ja_it_es_pt_im0050907.pdf#page=1
*)
TYPE ST_LinePhotoeye :
STRUCT
	(* Object-detection output from SICK RT-P4000S02 pin 2 (QPNP). *)
	Detection : BOOL;
	(* Sensor alarm output from SICK RT-P4000S02 pin 4. *)
	Alarm : BOOL;
END_STRUCT
END_TYPE
