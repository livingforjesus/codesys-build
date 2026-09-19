ClampedSpeed := F_Clamp(Value := 150, Low := 0, High := 100);
Conveyor.SetEnabled(Asserted := TRUE);
Conveyor();
Conveyor.RequestedSpeed := ClampedSpeed;
