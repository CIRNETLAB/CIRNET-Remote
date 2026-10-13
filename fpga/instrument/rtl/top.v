`timescale 1ns/1ps
// EP4CE10 future interface PLACEHOLDER. No ADC/DAC/SDRAM/CDC implementation.
// Clock names are domain boundaries, never frequency or board-pin assignments.
module netcircuit_instrument_scaffold (
    input wire control_clk,
    input wire acquisition_clk,
    input wire generator_clk,
    input wire sdram_clk,
    input wire reset_n,
    input wire capture_request,
    input wire generator_request,
    output wire logic_analyzer_available,
    output wire scope_2ch_available,
    output wire generator_2ch_available,
    output wire capture_valid,
    output wire generator_output_enable,
    output wire sdram_request
);
    assign logic_analyzer_available = 1'b0;
    assign scope_2ch_available = 1'b0;
    assign generator_2ch_available = 1'b0;
    assign capture_valid = 1'b0;
    assign generator_output_enable = 1'b0;
    assign sdram_request = 1'b0;
endmodule
