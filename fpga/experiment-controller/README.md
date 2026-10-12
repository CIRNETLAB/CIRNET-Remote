# Lab-First Experiment Controller

EP4CE6E22C8N prototype, no external SDRAM; Mini PC host through FpgaTransport, transport-independent protocol. Safety lifecycle guards topology scan, infrastructure routing, protected drive and experiment clock; fault/reset must disable outputs/routes.

Current RTL is scaffold only. R7 adds tested control boundaries; electrical scanning, switching/protection, exact pinout and driver remain TBD_BY_HARDWARE_DESIGN. Future EP4CE10E22C8N adds instrument/SDRAM interfaces after exact parts/timing are selected. Authority: ../../docs/ARCHITECTURE.md.
