# Circuit and Physical Lab Specification — Lab-First

Authority: ARCHITECTURE.md, canonical v3.1.

CircuitGraph / DesignGraph stays schema_version 1.0 under contracts/circuit-schema. Named source/destination ports define connectivity; optional position/Y rotation are presentation. Keep canonical editor catalog, direction/width/duplicate/extra-driver authoring rules and separate memory schema 1.0. Visual supply/instrument controls imply no electrical source/measurement.

DetectedTopologyGraph is a separate versioned observation contract, preserving wrong/missing/unexpected/opaque/ambiguous student wiring. Physical contact, electrical node, routing resource and FPGA channel are distinct. AssignmentDefinition holds LabEndpoint bindings, optional reference topology/design/profiles/behavior and assessment policy. Reference placement is not grading truth.

SafetyVerificationResult, TopologyVerificationResult and FunctionalVerificationResult are independent. ExecutionDecision blocks unsafe/indeterminate safety or unexecutable infrastructure only. Lab Execution Compiler emits InstrumentationExecutionPlan for infrastructure power/source/clock/instrument/sense routes, capture/test vectors and runtime protection, never reconstruction of internal student wiring.

Host: Linux Mini PC Intel Xeon W-1370 / 16 GB RAM / 256 GB SSD. EP4CE6E22C8N prototype without SDRAM → EP4CE10E22C8N future external SDRAM, Scope 2CH / Generator 2CH / Logic Analyzer/shared arbitration. Physical analog routing V1=false; physical slot target=1. Actual board/resource/channel counts are profile-derived. Physical support stays unavailable until driver/hardware evidence.

StationCapabilities: availability/mode, virtual/physical digital/analog, scan/safety/guarded support, resolution modes, channels/routing/resources and hardware_rpc_version / fpga_protocol_version / firmware_version / hardware_profile_version. Version domains are independent of CircuitGraph/transport/release.

Protection: current limiting/sensing, fast cutoff, tri-state/default-open routes, protected digital drive, guarded power-up, watchdog/runtime protection and safe-state timeout. See PHYSICAL_LAB_SAFETY.md. Software cannot prove protection exists.

Pinout/bank voltages, switching/protection schematic, ADC/DAC/AFE parts, SDRAM part/timing, transport IC, current/voltage/sample/frequency limits and measurements: TBD_BY_HARDWARE_DESIGN.
