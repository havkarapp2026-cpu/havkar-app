# Aldo SPEED UP MY TOUCH — hardware & sensor contract (v0)

## Hardware present (physical)
- Rectangular base
- Two upright poles
- Suspended football with two cable connections
- Pulleys / bearings
- Anchors
- Optional training panels

## Not yet available
- Contact / IMU / force sensors
- Calibrated firmware
- Validated force (newtons) measurement
- Validated accuracy scoring against a measurable target

## Software foundation (current)
- Player registration / display name
- Session start / end
- Simulated kick/contact counting (labeled **TEST/SIMULATION**)
- Optional left/right side tag when provided by UI (not from sensors)
- Coach-facing session history
- Anti-cheat placeholders: integrity_check events, no invented metrics

## Proposed sensor options (feasibility — not installed)
1. **IMU in ball or cable collar** — contact timing, swing direction heuristics.
2. **Piezo / load cell on cable anchors** — relative impulse; absolute force only after calibration.
3. **Optical / ToF gate** near contact zone — timing and side estimation.
4. **BLE SoC hub on base** — pairing, rate-limited event stream to HAVKAR app.

## Device communication (design)
- Protocol id: `havkar-aldo-ble-v0`
- Pairing code per device; short-lived session tokens server-side
- Event schema: `{ event_type, source, timestamp_ms, side? }`
- Forbidden until calibration: `force_newtons`, `accuracy_score`
- No arbitrary firmware upload to HAVKAR servers

## Safety review (required before field deployment)
- [ ] Mechanical cable/pulley failure modes
- [ ] Electrical isolation of any powered sensors
- [ ] User impact / rebound hazards
- [ ] Child / youth training supervision rules
- [ ] Emergency stop / disconnect procedure

## Funding
Any €500,000 support reference is **unverified** until documented approval exists.
