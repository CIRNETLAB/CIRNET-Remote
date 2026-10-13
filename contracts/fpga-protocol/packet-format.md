# Transport-independent FPGA envelope

Logical software envelope version: **1.0-scaffold** in control.schema.json. Hardware byte framing is TBD_BY_HARDWARE_DESIGN; no implemented physical packet decoder is claimed.

Mini PC → Hardware Service → FpgaTransport → selected Serial or USB-SPI adapter. Future USB3/Ethernet adapters implement the same bounded exchange boundary. Transport selection does not change safety/correctness semantics.

Required final-design inputs: bridge/device part and datasheet, board pins/reset polarity, byte ordering, frame sizing/version negotiation, sequence/replay handling, corruption detection, timeout behavior and independently enforced safe-state/watchdog. A lost/corrupt/late command must not leave drive enabled.

No transport driver is active. SerialFpgaTransport and UsbSpiFpgaTransport raise HARDWARE_UNAVAILABLE, including safe-state requests; they cannot acknowledge electrical application. Virtual simulation does not implement physical FPGA framing.
