CASE State OF
	E_StationState.Idle: State := E_StationState.Working;
	E_StationState.Working:
		Completed := Completed + 1;
		State := E_StationState.Idle;
END_CASE
